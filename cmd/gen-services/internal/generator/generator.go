// Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License"). You may
// not use this file except in compliance with the License. A copy of the
// License is located at
//
//     http://aws.amazon.com/apache2.0/
//
// or in the "license" file accompanying this file. This file is distributed
// on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
// express or implied. See the License for the specific language governing
// permissions and limitations under the License.

package generator

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/aws-controllers-k8s/community/cmd/gen-services/internal/scanner"
	"github.com/aws-controllers-k8s/community/cmd/gen-services/internal/types"

	"gopkg.in/yaml.v3"
)

func Generate(controllers []types.Controller, servicesPath, apiRefPath string) error {
	if err := generateServices(controllers, servicesPath); err != nil {
		return fmt.Errorf("services.json: %w", err)
	}
	if err := generateAPIReference(controllers, apiRefPath); err != nil {
		return fmt.Errorf("api-reference: %w", err)
	}
	return nil
}

func generateServices(controllers []types.Controller, path string) error {
	var services []types.Service
	for _, c := range controllers {
		services = append(services, buildService(c))
	}

	sort.Slice(services, func(i, j int) bool {
		if services[i].CRDCount != services[j].CRDCount {
			return services[i].CRDCount > services[j].CRDCount
		}
		iGA := services[i].MaintenancePhase == "General Availability"
		jGA := services[j].MaintenancePhase == "General Availability"
		if iGA != jGA {
			return iGA
		}
		return services[i].DisplayName < services[j].DisplayName
	})

	return writeJSON(path, services)
}

func buildService(c types.Controller) types.Service {
	return types.Service{
		Name:             c.ServiceName,
		DisplayName:      buildDisplayName(c.Metadata),
		Description:      c.Metadata.Service.FullName,
		MaintenancePhase: maintenancePhase(c.ServiceName, c.Version),
		Version:          strings.TrimPrefix(c.Version, "v"),
		CRDCount:         len(c.CRDs),
		CRDNames:         extractCRDNames(c.CRDs),
		GithubRepo:       fmt.Sprintf("https://github.com/aws-controllers-k8s/%s-controller", c.ServiceName),
		ChartRepo:        fmt.Sprintf("oci://public.ecr.aws/aws-controllers-k8s/%s-chart", c.ServiceName),
		ImageRepo:        fmt.Sprintf("public.ecr.aws/aws-controllers-k8s/%s-controller", c.ServiceName),
	}
}

func buildDisplayName(m *types.Metadata) string {
	name := m.Service.ShortName
	if name == "" {
		name = m.Service.FullName
	}
	if !strings.HasPrefix(name, "AWS ") && !strings.HasPrefix(name, "Amazon ") {
		name = "Amazon " + name
	}
	return name
}

func maintenancePhase(service, version string) string {
	if scanner.IsArchived(service) {
		return "Deprecated"
	}
	v := strings.TrimPrefix(version, "v")
	if parts := strings.Split(v, "."); len(parts) > 0 && parts[0] != "0" {
		return "General Availability"
	}
	return "Preview"
}

func extractCRDNames(crds []types.CRDFile) []string {
	var names []string
	for _, crd := range crds {
		var data map[string]any
		if yaml.Unmarshal([]byte(crd.Content), &data) != nil {
			continue
		}
		if kind := getString(data, "spec", "names", "kind"); kind != "" {
			names = append(names, kind)
		}
	}
	sort.Strings(names)
	return names
}

func generateAPIReference(controllers []types.Controller, path string) error {
	serviceMap := make(map[string][]types.Resource)
	exampleMap := make(map[string][]types.Example)
	versionMap := make(map[string]string)
	adoptionMap := make(map[string]*types.AdoptionMetadata)

	for _, c := range controllers {
		versionMap[c.ServiceName] = c.Version

		if c.AdoptionMetadata != nil {
			adoptionMap[c.ServiceName] = c.AdoptionMetadata
		}

		for _, crd := range c.CRDs {
			if r := parseCRD(crd.Content, c.ServiceName); r != nil {
				serviceMap[c.ServiceName] = append(serviceMap[c.ServiceName], *r)
			}
		}

		for _, ex := range c.Examples {
			exampleMap[c.ServiceName] = append(exampleMap[c.ServiceName], types.Example{
				Name: ex.Name,
				Kind: ex.Kind,
				YAML: strings.TrimSpace(ex.Content),
			})
		}
	}

	var services []types.ServiceRef
	for name, resources := range serviceMap {
		sort.Slice(resources, func(i, j int) bool {
			return resources[i].Kind < resources[j].Kind
		})

		if adoption := adoptionMap[name]; adoption != nil {
			mergeAdoptionInfo(resources, adoption)
		}

		examples := exampleMap[name]
		sort.Slice(examples, func(i, j int) bool {
			if examples[i].Kind != examples[j].Kind {
				return examples[i].Kind < examples[j].Kind
			}
			return examples[i].Name < examples[j].Name
		})

		services = append(services, types.ServiceRef{
			Name:           name,
			ReleaseVersion: versionMap[name],
			Status:         serviceStatus(name, versionMap[name]),
			Resources:      resources,
			Examples:       examples,
		})
	}

	sort.Slice(services, func(i, j int) bool {
		return services[i].Name < services[j].Name
	})

	index := types.ResourceIndex{
		TotalServices:  len(services),
		TotalResources: countResources(services),
		TotalExamples:  countExamples(services),
		Services:       services,
	}

	return writeJSON(path, index)
}

func serviceStatus(service, version string) string {
	if scanner.IsArchived(service) {
		return "archived"
	}
	v := strings.TrimPrefix(version, "v")
	if parts := strings.Split(v, "."); len(parts) > 0 {
		if major, _ := strconv.Atoi(parts[0]); major >= 1 {
			return "ga"
		}
	}
	return "preview"
}

func parseCRD(content, service string) *types.Resource {
	var data map[string]any
	if yaml.Unmarshal([]byte(content), &data) != nil {
		return nil
	}

	spec, _ := data["spec"].(map[string]any)
	if spec == nil {
		return nil
	}

	names, _ := spec["names"].(map[string]any)
	kind := getString(data, "spec", "names", "kind")
	if kind == "" {
		return nil
	}

	versions, _ := spec["versions"].([]any)
	if len(versions) == 0 {
		return nil
	}
	ver, _ := versions[0].(map[string]any)
	if ver == nil {
		return nil
	}

	schema, _ := ver["schema"].(map[string]any)
	openAPI, _ := schema["openAPIV3Schema"].(map[string]any)
	props, _ := openAPI["properties"].(map[string]any)

	var specFields, statusFields []types.Field
	if specProp, ok := props["spec"].(map[string]any); ok {
		specFields = parseFields(specProp)
	}
	if statusProp, ok := props["status"].(map[string]any); ok {
		statusFields = parseFields(statusProp)
	}

	description := ""
	if specProp, ok := props["spec"].(map[string]any); ok {
		description, _ = specProp["description"].(string)
	}

	return &types.Resource{
		Kind:         kind,
		Plural:       strVal(names, "plural"),
		Singular:     strVal(names, "singular"),
		Group:        strVal(spec, "group"),
		Version:      strVal(ver, "name"),
		Scope:        strVal(spec, "scope"),
		Description:  description,
		Path:         fmt.Sprintf("%s/%s", service, kind),
		SpecFields:   specFields,
		StatusFields: statusFields,
	}
}

func parseFields(prop map[string]any) []types.Field {
	properties, _ := prop["properties"].(map[string]any)
	if properties == nil {
		return nil
	}

	required := make(map[string]bool)
	if req, ok := prop["required"].([]any); ok {
		for _, r := range req {
			if s, ok := r.(string); ok {
				required[s] = true
			}
		}
	}

	var fields []types.Field
	for name, val := range properties {
		p, ok := val.(map[string]any)
		if !ok {
			continue
		}

		f := types.Field{
			Name:        name,
			Type:        strVal(p, "type"),
			Description: strVal(p, "description"),
			Required:    required[name],
		}
		if f.Type == "" {
			f.Type = "unknown"
		}

		if f.Type == "object" {
			f.Properties = parseFields(p)
		}
		if f.Type == "array" {
			if items, ok := p["items"].(map[string]any); ok {
				f.ItemType = strVal(items, "type")
				f.Properties = parseFields(items)
			}
		}

		fields = append(fields, f)
	}

	sort.Slice(fields, func(i, j int) bool {
		return fields[i].Name < fields[j].Name
	})
	return fields
}

func getString(data map[string]any, keys ...string) string {
	current := data
	for i, k := range keys {
		if i == len(keys)-1 {
			s, _ := current[k].(string)
			return s
		}
		next, ok := current[k].(map[string]any)
		if !ok {
			return ""
		}
		current = next
	}
	return ""
}

func strVal(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

func countResources(services []types.ServiceRef) int {
	n := 0
	for _, s := range services {
		n += len(s.Resources)
	}
	return n
}

func countExamples(services []types.ServiceRef) int {
	n := 0
	for _, s := range services {
		n += len(s.Examples)
	}
	return n
}

func mergeAdoptionInfo(resources []types.Resource, adoption *types.AdoptionMetadata) {
	lookup := make(map[string]*types.AdoptionResource, len(adoption.Resources))
	for i := range adoption.Resources {
		lookup[adoption.Resources[i].Kind] = &adoption.Resources[i]
	}

	for i := range resources {
		ar, ok := lookup[resources[i].Kind]
		if !ok {
			continue
		}
		resources[i].Adoption = &types.AdoptionInfo{
			Adoptable:         ar.Adoptable,
			Note:              ar.Note,
			PrimaryIdentifier: ar.PrimaryIdentifier,
			AdditionalKeys:    ar.AdditionalKeys,
		}
	}
}

func writeJSON(path string, v any) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}
