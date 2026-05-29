import React, { useEffect, useState, useRef } from 'react';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import { useHistory, useLocation } from '@docusaurus/router';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './api-reference.module.css';
import apiReferenceIndex from '../data/api-reference-index.json';

interface Field {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  properties?: Field[];
  itemType?: string; // For arrays - the type of items
}

interface AdoptionFieldEntry {
  fieldName: string;
  location: string; // "spec", "status", or "metadata"
  type: string;     // "name", "id", or "arn"
  required: boolean;
  note?: string;
}

interface AdoptionInfo {
  adoptable: boolean;
  note?: string;
  primaryIdentifier?: AdoptionFieldEntry;
  additionalKeys?: AdoptionFieldEntry[];
}

interface ResourceEntry {
  kind: string;
  plural: string;
  singular: string;
  group: string;
  version: string;
  scope: string;
  description?: string;
  path: string;
  specFields: Field[];
  statusFields: Field[];
  adoption?: AdoptionInfo;
}

interface ExampleEntry {
  name: string;
  kind: string;
  yaml: string;
}

interface ServiceIndex {
  name: string;
  releaseVersion?: string;
  status: 'ga' | 'preview' | 'archived'; // Pre-computed by generator
  resources: ResourceEntry[];
  examples?: ExampleEntry[];
}

interface ResourceIndex {
  totalServices: number;
  totalResources: number;
  totalExamples: number;
  services: ServiceIndex[];
}

// Render markdown description with custom link handling
function DescriptionMarkdown({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Open links in new tab
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        // Render paragraphs as spans to avoid nesting issues
        p: ({ children }) => <span className={styles.mdParagraph}>{children}</span>,
      }}
    >
      {text}
    </Markdown>
  );
}

// Truncatable description component
const DESC_CHAR_LIMIT = 220;

function TruncatableDescription({ text, limit = DESC_CHAR_LIMIT }: { text: string; limit?: number }) {
  const [showFull, setShowFull] = useState(false);

  if (!text || text.length <= limit) {
    return <DescriptionMarkdown text={text} />;
  }

  if (showFull) {
    return (
      <>
        <DescriptionMarkdown text={text} />
        <button
          className={styles.moreBtn}
          onClick={() => setShowFull(false)}
        >
          less
        </button>
      </>
    );
  }

  // Truncate at word boundary
  const truncated = text.slice(0, limit).replace(/\s+\S*$/, '');

  return (
    <>
      <DescriptionMarkdown text={truncated} />
      <span className={styles.ellipsis}>…</span>
      <button
        className={styles.moreBtn}
        onClick={() => setShowFull(true)}
      >
        more
      </button>
    </>
  );
}

// Nested fields component
function NestedFieldsCard({ fields, depth }: { fields: Field[]; depth: number }) {
  return (
    <div className={styles.nestedCard} style={{ marginLeft: `${depth * 16}px` }}>
      {fields.map((field) => (
        <NestedFieldItem key={field.name} field={field} depth={depth} />
      ))}
    </div>
  );
}

// Individual nested field item - structured like a mini table row
function NestedFieldItem({ field, depth }: { field: Field; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasNested = field.properties && field.properties.length > 0;

  return (
    <div className={styles.nestedFieldItem}>
      <div className={styles.nestedFieldRow}>
        <div className={styles.nestedFieldName}>
          {hasNested ? (
            <button
              className={`${styles.nestedExpandBtn} ${expanded ? styles.nestedExpandBtnExpanded : ''}`}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '−' : '+'}
            </button>
          ) : (
            <span className={styles.nestedExpandSpacer} />
          )}
          <code className={styles.nestedFieldCode}>{field.name}</code>
          {field.required && <span className={styles.nestedRequiredBadge}>required</span>}
        </div>
        <div className={styles.nestedFieldType}>
          <span className={`${styles.typeBadgeSmall} ${styles[`type${field.type.charAt(0).toUpperCase() + field.type.slice(1)}`]}`}>
            {field.type}
          </span>
        </div>
      </div>
      {field.description && (
        <div className={styles.nestedFieldDesc}>
          <TruncatableDescription text={field.description} />
        </div>
      )}
      {expanded && hasNested && (
        <NestedFieldsCard fields={field.properties!} depth={depth + 1} />
      )}
    </div>
  );
}

function FieldRow({ field }: { field: Field }) {
  const [expanded, setExpanded] = useState(false);
  const hasNested = field.properties && field.properties.length > 0;

  return (
    <div className={`${styles.fieldItem} ${hasNested && expanded ? styles.expandedParent : ''}`}>
      <div className={styles.fieldItemRow}>
        <div className={styles.fieldItemName}>
          {hasNested ? (
            <button
              className={`${styles.expandToggle} ${expanded ? styles.expandToggleExpanded : ''}`}
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
              title={expanded ? `Hide ${field.properties!.length} nested properties` : `Show ${field.properties!.length} nested properties`}
            >
              {expanded ? '−' : '+'}
            </button>
          ) : (
            <span className={styles.expandSpacer} />
          )}
          <code className={styles.fieldNameCode} title={field.name}>{field.name}</code>
          {field.required && <span className={styles.requiredTag}>required</span>}
        </div>
        <div className={styles.fieldItemType}>
          <span className={`${styles.typeBadge} ${styles[`type${field.type.charAt(0).toUpperCase() + field.type.slice(1)}`]}`}>
            {field.type}
          </span>
        </div>
        <div className={styles.fieldItemDesc}>
          {field.description ? <TruncatableDescription text={field.description} /> : <span className={styles.noDescription}>No description</span>}
        </div>
      </div>
      {expanded && hasNested && (
        <div className={styles.nestedCardContainer}>
          <NestedFieldsCard fields={field.properties!} depth={1} />
        </div>
      )}
    </div>
  );
}

function AdoptionSection({ adoption, kind }: { adoption: AdoptionInfo; kind: string }) {
  if (!adoption.adoptable) {
    return (
      <div className={styles.section}>
        <h4>Adoption</h4>
        <p className={styles.noFields}>This resource does not support adoption.</p>
      </div>
    );
  }

  const fields: AdoptionFieldEntry[] = [];
  if (adoption.primaryIdentifier) {
    fields.push(adoption.primaryIdentifier);
  }
  if (adoption.additionalKeys) {
    for (const key of adoption.additionalKeys) {
      fields.push(key);
    }
  }

  const requiredFields = fields.filter(f => f.required);
  const annotationValue = requiredFields.length > 0
    ? JSON.stringify(Object.fromEntries(requiredFields.map(f => [f.fieldName, '<value>'])))
    : '{}';

  return (
    <div className={styles.section}>
      <h4>Adoption</h4>
      <p className={styles.adoptionHelp}>
        To adopt an existing AWS resource into ACK management, apply the following annotation with the resource's identifier:
      </p>
      {adoption.note && (
        <p className={styles.adoptionNote}>{adoption.note}</p>
      )}
      <div className={styles.adoptionFields}>
        <div className={styles.fieldList}>
          <div className={styles.fieldListHeader}>
            <span className={styles.fieldListHeaderName}>Field</span>
            <span className={styles.fieldListHeaderType}>Location</span>
            <span className={styles.fieldListHeaderDesc}>Role</span>
          </div>
          {fields.map((f) => (
            <div key={f.fieldName} className={styles.fieldItem}>
              <div className={styles.fieldItemRow}>
                <div className={styles.fieldItemName}>
                  <span className={styles.expandSpacer} />
                  <code className={styles.fieldNameCode}>{f.fieldName}</code>
                  {f.required ? (
                    <span className={styles.requiredTag}>required</span>
                  ) : (
                    <span className={styles.optionalTag}>optional</span>
                  )}
                </div>
                <div className={styles.fieldItemType}>
                  <span className={styles.typeBadge}>{f.location}</span>
                </div>
                <div className={styles.fieldItemDesc}>
                  {f.note || (f.fieldName === adoption.primaryIdentifier?.fieldName ? 'Primary identifier' : 'Additional key')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.adoptionExample}>
        <p className={styles.adoptionExampleLabel}>Annotation:</p>
        <CodeBlock language="yaml">{`metadata:
  annotations:
    services.k8s.aws/adoption-policy: adopt
    services.k8s.aws/adoption-fields: '${annotationValue}'`}</CodeBlock>
      </div>
    </div>
  );
}

function FieldTable({ fields, title }: { fields: Field[]; title: string }) {
  if (!fields || fields.length === 0) {
    return (
      <div className={styles.section}>
        <h4>{title}</h4>
        <p className={styles.noFields}>No {title.toLowerCase()} documented</p>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h4>{title}</h4>
      <div className={styles.fieldList}>
        <div className={styles.fieldListHeader}>
          <span className={styles.fieldListHeaderName}>Field</span>
          <span className={styles.fieldListHeaderType}>Type</span>
          <span className={styles.fieldListHeaderDesc}>Description</span>
        </div>
        {fields.map((field) => (
          <FieldRow key={field.name} field={field} />
        ))}
      </div>
    </div>
  );
}

function ExamplesSection({ examples }: { examples: { name: string; kind: string; yaml: string }[] }) {
  // Group examples by Kind
  const byKind = examples.reduce((acc, ex) => {
    if (!acc[ex.kind]) acc[ex.kind] = [];
    acc[ex.kind].push(ex);
    return acc;
  }, {} as Record<string, typeof examples>);

  const kinds = Object.keys(byKind).sort();
  const [activeTab, setActiveTab] = useState(kinds[0] || '');
  // Start with first example expanded
  const firstExample = kinds[0] && byKind[kinds[0]]?.[0]?.name;
  const [expandedExample, setExpandedExample] = useState<string | null>(firstExample || null);

  return (
    <div className={styles.examplesTabs}>
      <div className={styles.examplesTabList}>
        {kinds.map(kind => (
          <button
            key={kind}
            className={`${styles.examplesTab} ${activeTab === kind ? styles.examplesTabActive : ''}`}
            onClick={() => {
              setActiveTab(kind);
              // Expand first example in the new tab
              setExpandedExample(byKind[kind]?.[0]?.name || null);
            }}
          >
            {kind}
            <span className={styles.examplesTabCount}>{byKind[kind].length}</span>
          </button>
        ))}
      </div>
      <div className={styles.examplesTabContent}>
        {byKind[activeTab]?.map(example => (
          <div key={example.name} className={styles.exampleItem}>
            <button
              className={`${styles.exampleItemHeader} ${expandedExample === example.name ? styles.exampleItemHeaderExpanded : ''}`}
              onClick={() => setExpandedExample(expandedExample === example.name ? null : example.name)}
            >
              <code>{example.name}</code>
              <span className={`${styles.exampleChevron} ${expandedExample === example.name ? styles.exampleChevronExpanded : ''}`} />
            </button>
            {expandedExample === example.name && (
              <div className={styles.exampleCodeBlock}>
                <CodeBlock language="yaml" showLineNumbers>{example.yaml}</CodeBlock>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceDetail({ resource, serviceName, onBack, onHome }: { resource: ResourceEntry; serviceName: string; onBack: () => void; onHome: () => void }) {
  return (
    <div className={styles.resourceDetail}>
      <nav className={styles.breadcrumbNav} aria-label="Breadcrumbs">
        <button className={styles.breadcrumbButton} onClick={onHome} aria-label="API Reference home">
          <svg viewBox="0 0 24 24" className={styles.breadcrumbHomeIcon}>
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/>
          </svg>
        </button>
        <span className={styles.breadcrumbSeparator}>/</span>
        <button className={styles.breadcrumbButton} onClick={onBack}>
          {serviceName}
        </button>
        <span className={styles.breadcrumbSeparator}>/</span>
        <span className={styles.breadcrumbCurrent}>{resource.kind}</span>
      </nav>
      <div className={styles.resourceHeader}>
        <h2>{resource.kind}</h2>
        <div className={styles.resourceMeta}>
          <span className={styles.metaBadge}>
            <strong>Group:</strong> {resource.group}
          </span>
          <span className={styles.metaBadge}>
            <strong>Version:</strong> {resource.version}
          </span>
          <span className={styles.metaBadge}>
            <strong>Scope:</strong> {resource.scope}
          </span>
        </div>
      </div>

      {resource.description && (
        <div className={styles.description}>
          <p><TruncatableDescription text={resource.description} limit={300} /></p>
        </div>
      )}

      {resource.adoption && (
        <AdoptionSection adoption={resource.adoption} kind={resource.kind} />
      )}

      <FieldTable fields={resource.specFields} title="Spec Fields" />
      <FieldTable fields={resource.statusFields} title="Status Fields" />
    </div>
  );
}

function Sidebar({
  index,
  selectedPath,
  selectedService,
  onSelectResource,
  onSelectService
}: {
  index: ResourceIndex;
  selectedPath: string | null;
  selectedService: string | null;
  onSelectResource: (path: string) => void;
  onSelectService: (service: string) => void;
}) {
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const sidebarRef = useRef<HTMLDivElement>(null);
  const serviceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isInitialMount = useRef(true);

  const toggleService = (e: React.MouseEvent, service: string) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedServices);
    if (newExpanded.has(service)) {
      newExpanded.delete(service);
    } else {
      newExpanded.add(service);
    }
    setExpandedServices(newExpanded);
  };

  // Filter out archived services and apply search
  const filteredServices = index.services.filter(service => {
    // Never show archived services in sidebar
    if (service.status === 'archived') return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return service.name.toLowerCase().includes(term) ||
           service.resources.some(r => r.kind.toLowerCase().includes(term));
  });

  // Auto-expand services that match search or contain selected resource
  useEffect(() => {
    const newExpanded = new Set<string>();
    if (searchTerm) {
      filteredServices.forEach(service => newExpanded.add(service.name));
    }
    if (selectedPath) {
      const service = selectedPath.split('/')[0];
      newExpanded.add(service);
    }
    if (selectedService) {
      newExpanded.add(selectedService);
    }
    setExpandedServices(newExpanded);
  }, [searchTerm, selectedPath, selectedService]);

  // Scroll to selected service only on initial page load (coming from another page)
  // and only if the service is far down the list (15th or later)
  useEffect(() => {
    if (!isInitialMount.current) return;
    isInitialMount.current = false;

    const targetService = selectedService || (selectedPath ? selectedPath.split('/')[0] : null);
    if (!targetService) return;

    // Find the index of the target service in the list
    const serviceIndex = index.services.findIndex(s => s.name === targetService);
    if (serviceIndex < 14) return; // Don't scroll for first 14 services (they're already visible)

    // Wait for DOM and expansion animation
    setTimeout(() => {
      const element = serviceRefs.current.get(targetService);
      const sidebar = sidebarRef.current;
      if (element && sidebar) {
        const sidebarRect = sidebar.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const headerHeight = 100;
        const keepAbove = 120; // Keep ~3 services visible above

        // Scroll to show service with some services visible above
        const scrollOffset = elementRect.top - sidebarRect.top - headerHeight - keepAbove + sidebar.scrollTop;
        sidebar.scrollTo({ top: Math.max(0, scrollOffset), behavior: 'smooth' });
      }
    }, 150);
  }, []); // Empty deps = only on mount

  return (
    <div className={styles.sidebar} ref={sidebarRef}>
      <div className={styles.sidebarHeader}>
        <h3>Resources</h3>
        <input
          type="text"
          className={styles.sidebarSearch}
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <nav className={styles.sidebarNav}>
        {filteredServices.map((service) => {
          const isServiceSelected = selectedService === service.name && !selectedPath;
          return (
            <div
              key={service.name}
              className={styles.serviceGroup}
              ref={(el) => { if (el) serviceRefs.current.set(service.name, el); }}
            >
              <button
                className={`${styles.serviceToggle} ${isServiceSelected ? styles.serviceToggleActive : ''}`}
                onClick={(e) => {
                  const wasExpanded = expandedServices.has(service.name);
                  toggleService(e, service.name);
                  // If we just expanded it (was collapsed), also select it
                  if (!wasExpanded) {
                    onSelectService(service.name);
                  }
                }}
              >
                <span
                  className={styles.expandButton}
                  onClick={(e) => toggleService(e, service.name)}
                  role="button"
                  aria-label={expandedServices.has(service.name) ? 'Collapse' : 'Expand'}
                >
                  <span className={`${styles.chevron} ${expandedServices.has(service.name) ? styles.chevronExpanded : ''}`} />
                </span>
                <span className={styles.serviceName}>{service.name.toUpperCase()}</span>
                <span className={styles.resourceCount}>
                  {service.resources.length}
                </span>
              </button>
              <div className={`${styles.resourceList} ${expandedServices.has(service.name) ? styles.resourceListExpanded : ''}`}>
                <div className={styles.resourceListInner}>
                  {service.resources
                    .filter(r => !searchTerm || r.kind.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((resource) => (
                      <button
                        key={resource.path}
                        className={`${styles.resourceLink} ${selectedPath === resource.path ? styles.resourceLinkActive : ''}`}
                        onClick={() => onSelectResource(resource.path)}
                      >
                        {resource.kind}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function ServiceSummary({
  service,
  onSelectResource,
  onHome
}: {
  service: ServiceIndex;
  onSelectResource: (path: string) => void;
  onHome: () => void;
}) {
  // Status is pre-computed by the generator
  const status = service.status;

  return (
    <div className={styles.serviceSummary}>
      <nav className={styles.breadcrumbNav} aria-label="Breadcrumbs">
        <button className={styles.breadcrumbButton} onClick={onHome} aria-label="API Reference home">
          <svg viewBox="0 0 24 24" className={styles.breadcrumbHomeIcon}>
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/>
          </svg>
        </button>
        <span className={styles.breadcrumbSeparator}>/</span>
        <span className={styles.breadcrumbCurrent}>{service.name}</span>
      </nav>
      <div className={styles.serviceSummaryHeader}>
        <h1>{service.name.toUpperCase()}</h1>
        <div className={styles.serviceSummaryMeta}>
          <span className={`${styles.statusBadgeLarge} ${styles[`status${status.charAt(0).toUpperCase() + status.slice(1)}`]}`}>
            {status === 'ga' ? 'General Availability' : status === 'preview' ? 'Preview' : 'Archived'}
          </span>
          {service.releaseVersion && (
            <span className={styles.versionBadge}>v{service.releaseVersion}</span>
          )}
        </div>
      </div>

      <div className={styles.serviceSummaryStats}>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{service.resources.length}</div>
          <div className={styles.statLabel}>CRDs</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{service.examples?.length || 0}</div>
          <div className={styles.statLabel}>Examples</div>
        </div>
      </div>

      <div className={styles.resourcesSection}>
        <h3>Available Resources</h3>
        <p className={styles.resourcesHelp}>
          Click on a resource to view its complete API specification including all spec and status fields.
        </p>
        <div className={styles.resourceGrid}>
          {service.resources.map((resource) => (
            <button
              key={resource.path}
              className={styles.resourceCard}
              onClick={() => onSelectResource(resource.path)}
            >
              <div className={styles.resourceCardHeader}>
                <span className={styles.resourceKind}>{resource.kind}</span>
              </div>
              <div className={styles.resourceCardMeta}>
                <code>{resource.group}/{resource.version}</code>
              </div>
            </button>
          ))}
        </div>
      </div>

      {service.examples && service.examples.length > 0 && (
        <div className={styles.resourcesSection}>
          <h3>Examples</h3>
          <p className={styles.resourcesHelp}>
            Sample manifests from the controller's e2e tests. Click on a row to view the YAML.
          </p>
          <ExamplesSection key={service.name} examples={service.examples} />
        </div>
      )}
    </div>
  );
}

type SearchResult =
  | { type: 'service'; service: ServiceIndex }
  | { type: 'resource'; service: string; resource: ResourceEntry };

function WelcomeScreen({
  index,
  onSelectResource,
  onSelectService
}: {
  index: ResourceIndex;
  onSelectResource: (path: string) => void;
  onSelectService: (service: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');

  // Search across both services and resources
  const searchResults: SearchResult[] = searchTerm.length >= 2 ? (() => {
    const term = searchTerm.toLowerCase();
    const results: SearchResult[] = [];

    // Find matching services
    const matchingServices = index.services
      .filter(s => s.status !== 'archived' && s.name.toLowerCase().includes(term));

    for (const service of matchingServices) {
      results.push({ type: 'service', service });
    }

    // Find matching resources (show both service and resource if both match)
    for (const service of index.services) {
      if (service.status === 'archived') continue;

      for (const resource of service.resources) {
        if (resource.kind.toLowerCase().includes(term)) {
          results.push({ type: 'resource', service: service.name, resource });
        }
      }
    }

    return results.slice(0, 10);
  })() : [];

  return (
    <div className={styles.welcome}>
      <h1>API Reference</h1>
      <p className={styles.welcomeText}>
        Browse API documentation for {index.totalResources} resources across {index.totalServices} AWS service controllers.
      </p>

      <div className={styles.welcomeSearch}>
        <input
          type="text"
          className={styles.welcomeSearchInput}
          placeholder="Search for a service or resource (e.g., s3, Bucket, lambda)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchResults.length > 0 && (
          <div className={styles.welcomeSearchResults}>
            {searchResults.map((result) =>
              result.type === 'service' ? (
                <button
                  key={`service-${result.service.name}`}
                  className={`${styles.welcomeSearchResult} ${styles.searchResultServiceRow}`}
                  onClick={() => onSelectService(result.service.name)}
                >
                  <span className={styles.searchResultLeft}>
                    <span className={styles.searchResultIcon}>S</span>
                    <span className={styles.searchResultKind}>{result.service.name}</span>
                  </span>
                  <span className={styles.searchResultBadge}>{result.service.resources.length} CRDs</span>
                </button>
              ) : (
                <button
                  key={result.resource.path}
                  className={styles.welcomeSearchResult}
                  onClick={() => onSelectResource(result.resource.path)}
                >
                  <span className={styles.searchResultKind}>{result.resource.kind}</span>
                  <span className={styles.searchResultService}>{result.service}</span>
                </button>
              )
            )}
          </div>
        )}
      </div>

      <div className={styles.welcomeStats}>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{index.totalServices}</div>
          <div className={styles.statLabel}>Services</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{index.totalResources}</div>
          <div className={styles.statLabel}>Resources</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>{index.totalExamples}</div>
          <div className={styles.statLabel}>Examples</div>
        </div>
      </div>

      <div className={styles.welcomeProposal}>
        <p className={styles.welcomeProposalText}>
          Can't find what you're looking for?{' '}
          <a
            href="https://github.com/aws-controllers-k8s/community/issues/new?labels=Service+Controller&template=propose_new_controller.md&title=%5Bname%5D+service+controller"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.welcomeProposalLink}
          >
            Request a new service
          </a>
          {' '}or{' '}
          <a
            href="https://github.com/aws-controllers-k8s/community/issues/new?labels=Kind+Support&template=propose_new_kind.md&title=%5Bservice%5D+%5Bkind%5D+support"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.welcomeProposalLink}
          >
            request a new CRD
          </a>
          {' '}on GitHub.
        </p>
      </div>
    </div>
  );
}

// Cast the imported index to the correct type (preprocessed data)
const typedIndex = apiReferenceIndex as unknown as ResourceIndex;

export default function APIReference(): React.ReactElement {
  const [selectedResource, setSelectedResource] = useState<ResourceEntry | null>(null);

  const location = useLocation();
  const history = useHistory();

  // Parse hash to determine if it's a service or resource path
  const parseHash = () => {
    const hash = location.hash.replace('#', '');
    if (!hash) return { service: null, resourcePath: null };

    // If hash contains '/', it's a resource path (e.g., "s3/Bucket")
    // Otherwise, it's a service name (e.g., "dynamodb")
    if (hash.includes('/')) {
      return { service: hash.split('/')[0], resourcePath: hash };
    }
    return { service: hash, resourcePath: null };
  };

  const [selectedPath, setSelectedPath] = useState<string | null>(() => parseHash().resourcePath);
  const [selectedService, setSelectedService] = useState<string | null>(() => parseHash().service);

  // Find resource when path changes (using preprocessed data - no parsing needed)
  useEffect(() => {
    if (!selectedPath) {
      setSelectedResource(null);
      return;
    }

    const [serviceName, kind] = selectedPath.split('/');
    const service = typedIndex.services.find(s => s.name === serviceName);
    const resourceEntry = service?.resources.find(r => r.kind === kind);

    setSelectedResource(resourceEntry || null);
  }, [selectedPath]);

  // Keep main content at top - sidebar handles its own scrolling
  useEffect(() => {
    // Scroll main page to top when selection changes
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [selectedService, selectedPath]);

  // Update URL when resource is selected
  const handleSelectResource = (path: string) => {
    setSelectedPath(path);
    setSelectedService(path.split('/')[0]);
    history.push(`#${path}`);
  };

  // Update URL when service is selected
  const handleSelectService = (service: string) => {
    setSelectedPath(null);
    setSelectedService(service);
    history.push(`#${service}`);
  };

  // Sync with URL changes
  useEffect(() => {
    const { service, resourcePath } = parseHash();
    if (resourcePath !== selectedPath) {
      setSelectedPath(resourcePath);
    }
    if (service !== selectedService) {
      setSelectedService(service);
    }
  }, [location.hash]);

  // Get the selected service data (using pre-sorted data from generator)
  const selectedServiceData = selectedService
    ? typedIndex.services.find(s => s.name === selectedService)
    : null;

  // Calculate dynamic min-height based on content
  const calculateMinHeight = () => {
    if (!selectedServiceData) return 800; // Default for welcome screen

    // Base height for header, resources section, etc.
    let height = 600;

    // Add height for resources grid (roughly 120px per row of 3 cards)
    const resourceRows = Math.ceil(selectedServiceData.resources.length / 3);
    height += resourceRows * 140;

    // Add height for examples section
    if (selectedServiceData.examples && selectedServiceData.examples.length > 0) {
      // Find the largest example YAML
      const maxYamlLines = Math.max(
        ...selectedServiceData.examples.map((ex: ExampleEntry) => (ex.yaml.match(/\n/g) || []).length + 1)
      );
      // Estimate ~20px per line of YAML code
      height += 200 + (maxYamlLines * 20);
    }

    return Math.max(height, 800);
  };

  return (
    <Layout title="API Reference" description="ACK API Reference Documentation">
      <div className={styles.apiReference}>
        <Sidebar
          index={typedIndex}
          selectedPath={selectedPath}
          selectedService={selectedService}
          onSelectResource={handleSelectResource}
          onSelectService={handleSelectService}
        />
        <main className={styles.content} style={{ minHeight: `${calculateMinHeight()}px` }}>
          {selectedPath ? (
            // Show resource detail when a specific resource is selected
            selectedResource ? (
              <ResourceDetail
                resource={selectedResource}
                serviceName={selectedPath.split('/')[0]}
                onBack={() => handleSelectService(selectedPath.split('/')[0])}
                onHome={() => {
                  setSelectedPath(null);
                  setSelectedService(null);
                  history.push('#');
                }}
              />
            ) : (
              <div className={styles.noResults}>
                <p>Resource not found</p>
              </div>
            )
          ) : selectedServiceData ? (
            // Show service summary when a service is selected (but no resource)
            <ServiceSummary
              service={selectedServiceData}
              onSelectResource={handleSelectResource}
              onHome={() => {
                setSelectedPath(null);
                setSelectedService(null);
                history.push('#');
              }}
            />
          ) : (
            // Show welcome screen when nothing is selected
            <WelcomeScreen
              index={typedIndex}
              onSelectResource={handleSelectResource}
              onSelectService={handleSelectService}
            />
          )}
        </main>
      </div>
    </Layout>
  );
}
