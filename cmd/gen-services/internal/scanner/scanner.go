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

package scanner

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws-controllers-k8s/community/cmd/gen-services/internal/types"

	"gopkg.in/yaml.v3"
)

var archivedServices = map[string]bool{
	"elasticsearchservice": true,
}

func IsArchived(service string) bool {
	return archivedServices[service]
}

// Scan walks the controllers directory and returns data for all valid controllers.
func Scan(dir string) ([]types.Controller, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("reading controllers directory: %w", err)
	}

	var controllers []types.Controller
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasSuffix(entry.Name(), "-controller") {
			continue
		}

		path := filepath.Join(dir, entry.Name())
		service := strings.TrimSuffix(entry.Name(), "-controller")

		if _, err := os.Stat(filepath.Join(path, "metadata.yaml")); os.IsNotExist(err) {
			continue
		}

		ctrl, err := scanOne(path, service)
		if err != nil {
			fmt.Fprintf(os.Stderr, "warning: %s: %v\n", entry.Name(), err)
			continue
		}
		if ctrl != nil {
			controllers = append(controllers, *ctrl)
		}
	}

	return controllers, nil
}

func scanOne(path, service string) (*types.Controller, error) {
	metadata, err := readMetadata(filepath.Join(path, "metadata.yaml"))
	if err != nil {
		return nil, fmt.Errorf("reading metadata: %w", err)
	}

	version := readHelmVersion(path)
	if version == "" {
		fmt.Fprintf(os.Stderr, "warning: skipping %s (no helm version)\n", service)
		return nil, nil
	}

	crds, err := collectCRDs(path)
	if err != nil {
		return nil, fmt.Errorf("collecting CRDs: %w", err)
	}

	examples, _ := collectExamples(path)          // non-fatal if missing
	adoption, _ := readAdoptionMetadata(path)     // non-fatal if missing

	return &types.Controller{
		ServiceName:      service,
		Path:             path,
		Metadata:         metadata,
		Version:          version,
		CRDs:             crds,
		Examples:         examples,
		AdoptionMetadata: adoption,
	}, nil
}

func readMetadata(path string) (*types.Metadata, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var m types.Metadata
	return &m, yaml.Unmarshal(data, &m)
}

func readHelmVersion(controllerPath string) string {
	data, err := os.ReadFile(filepath.Join(controllerPath, "helm", "Chart.yaml"))
	if err != nil {
		return ""
	}
	var chart types.HelmChart
	if yaml.Unmarshal(data, &chart) != nil {
		return ""
	}
	return chart.Version
}

func collectCRDs(controllerPath string) ([]types.CRDFile, error) {
	dir := filepath.Join(controllerPath, "config", "crd", "bases")
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return nil, nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var crds []types.CRDFile
	for _, e := range entries {
		if e.IsDir() || (!strings.HasSuffix(e.Name(), ".yaml") && !strings.HasSuffix(e.Name(), ".yml")) {
			continue
		}
		path := filepath.Join(dir, e.Name())
		content, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "warning: reading %s: %v\n", e.Name(), err)
			continue
		}
		crds = append(crds, types.CRDFile{
			Name:    e.Name(),
			Path:    path,
			Content: string(content),
		})
	}
	return crds, nil
}

func collectExamples(controllerPath string) ([]types.ExampleFile, error) {
	dir := filepath.Join(controllerPath, "test", "e2e", "resources")
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return nil, nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var examples []types.ExampleFile
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || name == "bootstrap.yaml" || strings.HasPrefix(name, "_") {
			continue
		}
		if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			continue
		}

		content, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			continue
		}

		kind := extractKind(content)
		if kind == "" || kind == "AdoptedResource" {
			continue
		}

		examples = append(examples, types.ExampleFile{
			Name:    name,
			Kind:    kind,
			Content: string(content),
		})
	}
	return examples, nil
}

func extractKind(content []byte) string {
	var r struct {
		Kind string `yaml:"kind"`
	}
	yaml.Unmarshal(content, &r)
	return r.Kind
}

func readAdoptionMetadata(controllerPath string) (*types.AdoptionMetadata, error) {
	data, err := os.ReadFile(filepath.Join(controllerPath, "adoption-metadata.json"))
	if err != nil {
		return nil, err
	}
	var m types.AdoptionMetadata
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}
