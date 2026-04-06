export interface DocSection {
  id: string;
  title: string;
  content: string;
  subsections?: DocSection[];
}

export interface ApiEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  name: string;
  description: string;
  parameters?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
    in: 'query' | 'path' | 'header';
  }[];
  requestBody?: {
    type: 'json' | 'form-data';
    example?: any;
    schema?: any;
  };
  responses?: {
    code: number;
    description: string;
    example?: any;
    schema?: any;
  }[];
}

export interface ApiModule {
  id: string;
  name: string;
  endpoints: ApiEndpoint[];
}

export interface GlossaryItem {
  term: string;
  definition: string;
  category: string;
}

export const documentation: DocSection[] = [
  {
    id: 'introduction',
    title: 'Introduction',
    content: 'This document provides a consolidated list of the AI use cases identified as part of the AI foundation initiative for 1NCE. The purpose of this document is to outline the AI capabilities currently being explored and the platforms used to develop or implement these capabilities.',
    subsections: [
      {
        id: 'functional-categories',
        title: 'Use Case Functional Categories',
        content: 'The identified AI use cases fall into several functional domains: Customer Support, Sales and Revenue Operations, Legal and Compliance, Operational Automation, Internal Productivity, and Data Insights and Reporting.'
      },
      {
        id: 'implementation-platforms',
        title: 'Current Implementation Platforms',
        content: 'The current AI solutions are implemented across a mix of workflow automation tools (Beam AI - to be retired, n8n - to keep), custom development (Node.js/TypeScript), and integrated AI services (Vapi.ai, OpenAI, Bedrock).'
      }
    ]
  },
  {
    id: 'use-case-catalog',
    title: 'AI Use Case Catalog',
    content: 'A comprehensive list of AI use cases identified for 1NCE.',
    subsections: [
      { id: 'b2b-check', title: 'B2B Check Agent', content: 'Ensures compliance by validating VAT IDs, managing customer data, and reporting discrepancies. Platform: Beam AI.' },
      { id: 'email-triage', title: 'Forward Email Triage Agent', content: 'Automates email sorting, prioritization, and quick responses to streamline inbox management. Platform: Beam AI.' },
      { id: 'customer-service', title: 'Customer Service Agent', content: 'Autonomously responds to appointment scheduling, product return requests, and general support questions. Platform: Beam AI.' },
      { id: 'jira-management', title: 'Jira Ticket Management Agent', content: 'Automates Jira ticket creation, assignment, monitoring, and reporting. Platform: Beam AI.' },
      { id: 'melita-sales', title: 'Melita AI Sales Agent', content: 'AI Chatbot designed to support customer interactions on the 1NCE website, supporting product inquiries and sales discovery.' },
      { id: 'voice-ai', title: 'Voice AI', content: 'A Vapi-based AI voice assistant system providing 24/7 premium customer support with multi-language intake.' }
    ]
  },
  {
    id: 'platform-architecture',
    title: 'Platform Architecture',
    content: 'The 1NCE AI Foundation is a multi-tenant AI platform built on AWS.',
    subsections: [
      {
        id: 'architecture-overview',
        title: 'Architecture Overview',
        content: 'The platform is structured into two logical planes: The Control Plane (routing, governance, configuration via DynamoDB) and the Execution Plane (AI inference via Amazon Bedrock AgentCore Runtime).'
      },
      {
        id: 'unified-gateway',
        title: 'Unified AI Gateway',
        content: 'A single entry point for all AI workloads. Features model routing, per-tenant authentication, request/response logging, and rate limiting.'
      },
      {
        id: 'knowledge-layer',
        title: 'Centralized Knowledge Layer',
        content: 'A single vector store/knowledge index with defined schema, standardized ingestion pipeline, and scoped access controls.'
      }
    ]
  },
  {
    id: 'technical-specs',
    title: 'Technical Specifications',
    content: 'Detailed technical documentation for core components.',
    subsections: [
      {
        id: 'quota-management',
        title: 'Quota Management & Resilience',
        content: 'Strategy for handling service quotas (TPM/RPM) in a multi-tenant environment. Includes immediate intelligent routing to fallback models and token budget pre-checking.'
      },
      {
        id: 'direct-llm-access',
        title: 'Direct LLM Access',
        content: 'A dynamic inference endpoint (generic_llm) allowing tenants to programmatically define generation parameters, system instructions, and JSON schemas at runtime.'
      }
    ]
  },
  {
    id: 'milestones',
    title: 'Milestones & Timeline',
    content: 'The project follows a 12-week plan from initiation to POC development.',
    subsections: [
      { id: 'phase-1', title: 'Phase 1: Project Initiation', content: 'Kickoff, alignment, and current state assessment (Weeks 1-2).' },
      { id: 'phase-2', title: 'Phase 2: MVP Use Case Discovery', content: 'Use case inventory and pattern mapping (Weeks 1-2).' },
      { id: 'phase-3', title: 'Phase 3: AI Architecture Design', content: 'Target state AWS architecture finalized (Week 3).' },
      { id: 'phase-4', title: 'Phase 4: Implementation Planning', content: 'Development ready - Repos, CI/CD, and base structure (Week 4).' },
      { id: 'phase-5', title: 'Phase 5: POC Development', content: 'MVP POCs built, tested, and handed over (Weeks 5-12).' }
    ]
  }
];

export const apiExplorer: ApiModule[] = [
  {
    id: 'auth',
    name: 'Authentication',
    endpoints: [
      {
        id: 'login',
        method: 'POST',
        path: '/login',
        name: 'User Login',
        description: 'Authenticate an admin user with email and password. Returns a bearer token on success.',
        requestBody: {
          type: 'json',
          schema: {
            email: { type: 'string', format: 'email', example: 'admin@1nce.com' },
            password: { type: 'string', example: 'password123' }
          }
        }
      }
    ]
  },
  {
    id: 'admin-users',
    name: 'Admin Users',
    endpoints: [
      {
        id: 'list-admins',
        method: 'GET',
        path: '/admins/',
        name: 'List all admin users',
        description: 'Retrieve all admin users. Password is never returned.'
      },
      {
        id: 'create-admin',
        method: 'POST',
        path: '/admins/',
        name: 'Create an admin user',
        description: 'Create a new admin user. Password is stored hashed.',
        requestBody: {
          type: 'json',
          schema: {
            name: { type: 'string', minLength: 1, example: 'John Doe' },
            email: { type: 'string', format: 'email', example: 'john@company.com' },
            password: { type: 'string', minLength: 8, example: 'securepass123' },
            status: { type: 'boolean', default: true, example: true }
          }
        }
      },
      {
        id: 'get-admin',
        method: 'GET',
        path: '/admins/{admin_id}',
        name: 'Get an admin user',
        description: 'Fetch a single admin user by ID.',
        parameters: [
          { name: 'admin_id', type: 'integer', required: true, description: 'Admin Id', in: 'path' }
        ]
      },
      {
        id: 'update-admin',
        method: 'PUT',
        path: '/admins/{admin_id}',
        name: 'Update an admin user',
        description: 'Update admin user details. Password is re-hashed if provided.',
        parameters: [
          { name: 'admin_id', type: 'integer', required: true, description: 'Admin Id', in: 'path' }
        ],
        requestBody: {
          type: 'json',
          schema: {
            name: { type: 'string', minLength: 1, example: 'John Updated' },
            email: { type: 'string', format: 'email', example: 'john.new@company.com' },
            password: { type: 'string', minLength: 8, example: 'newpassword123' },
            status: { type: 'boolean', example: false }
          }
        }
      },
      {
        id: 'delete-admin',
        method: 'DELETE',
        path: '/admins/{admin_id}',
        name: 'Delete an admin user',
        description: 'Permanently delete an admin user.',
        parameters: [
          { name: 'admin_id', type: 'integer', required: true, description: 'Admin Id', in: 'path' }
        ]
      }
    ]
  },
  {
    id: 'agents',
    name: 'Agent Management',
    endpoints: [
      {
        id: 'list-agents',
        method: 'GET',
        path: '/agents/',
        name: 'List all agents',
        description: 'Retrieve all agents from DynamoDB.'
      },
      {
        id: 'create-agent',
        method: 'POST',
        path: '/agents/',
        name: 'Create an agent',
        description: 'Create a new agent. usecase_id is the partition key and must be unique.',
        requestBody: {
          type: 'json',
          schema: {
            usecase_id: { type: 'string', minLength: 1, example: 'ai_1nce_dev_forward_email_triage_agent' },
            name: { type: 'string', minLength: 1, example: 'Forward Email Triage Agent' },
            arn: { type: 'string', minLength: 1, example: 'arn:aws:bedrock-agentcore:us-east-2:123456789:runtime/agent-xyz' },
            description: { type: 'string', example: 'Forward email triage agent' },
            is_active: { type: 'boolean', default: true, example: true }
          }
        }
      },
      {
        id: 'get-agent',
        method: 'GET',
        path: '/agents/{usecase_id}',
        name: 'Get an agent',
        description: 'Fetch a single agent by its usecase_id.',
        parameters: [
          { name: 'usecase_id', type: 'string', required: true, description: 'Usecase Id', in: 'path' }
        ]
      },
      {
        id: 'update-agent',
        method: 'PUT',
        path: '/agents/{usecase_id}',
        name: 'Update an agent',
        description: 'Update agent fields by usecase_id.',
        parameters: [
          { name: 'usecase_id', type: 'string', required: true, description: 'Usecase Id', in: 'path' }
        ],
        requestBody: {
          type: 'json',
          schema: {
            name: { type: 'string', minLength: 1, example: 'Updated Agent Name' },
            arn: { type: 'string', minLength: 1, example: 'arn:aws:bedrock-agentcore:us-east-2:123456789:runtime/agent-abc' },
            description: { type: 'string', example: 'Updated description' },
            is_active: { type: 'boolean', example: false }
          }
        }
      },
      {
        id: 'list-versions',
        method: 'GET',
        path: '/agents/{usecase_id}/versions',
        name: 'List Agent Versions',
        description: 'Retrieve all versions for a given agent usecase_id.',
        parameters: [
          { name: 'usecase_id', type: 'string', required: true, description: 'Usecase Id', in: 'path' }
        ]
      },
      {
        id: 'create-version',
        method: 'POST',
        path: '/agents/{usecase_id}/versions',
        name: 'Create Agent Version',
        description: 'Create a new version for an agent. Composite key: usecase_id + version.',
        parameters: [
          { name: 'usecase_id', type: 'string', required: true, description: 'Usecase Id', in: 'path' }
        ],
        requestBody: {
          type: 'json',
          schema: {
            version: { type: 'string', minLength: 1, example: 'v1' },
            bedrock_agentcore_arn: { type: 'string', minLength: 1, example: 'arn:aws:bedrock-agentcore:us-east-1:943143228843:runtime/forward_email_triage_agent-vesafcAXiz' },
            model_id: { type: 'string', minLength: 1, example: 'us.anthropic.claude-haiku-4-5-20251001-v1:0' },
            default_temperature: { type: 'number', example: 0.7 }
          }
        }
      },
      {
        id: 'get-version',
        method: 'GET',
        path: '/agents/{usecase_id}/versions/{version}',
        name: 'Get Specific Version',
        description: 'Fetch a single version by usecase_id and version.',
        parameters: [
          { name: 'usecase_id', type: 'string', required: true, description: 'Usecase Id', in: 'path' },
          { name: 'version', type: 'string', required: true, description: 'Version', in: 'path' }
        ]
      },
      {
        id: 'update-version-status',
        method: 'PATCH',
        path: '/agents/{usecase_id}/versions/{version}/status',
        name: 'Update Version Status',
        description: 'Toggle a version\'s status between true and false.',
        parameters: [
          { name: 'usecase_id', type: 'string', required: true, description: 'Usecase Id', in: 'path' },
          { name: 'version', type: 'string', required: true, description: 'Version', in: 'path' }
        ],
        requestBody: {
          type: 'json',
          schema: {
            status: { type: 'boolean', example: false }
          }
        }
      }
    ]
  },
  {
    id: 'customers',
    name: 'Customer Management',
    endpoints: [
      {
        id: 'list-customers',
        method: 'GET',
        path: '/customers/',
        name: 'List all customers',
        description: 'List all customers with their usecase configs.'
      },
      {
        id: 'create-customer',
        method: 'POST',
        path: '/customers/',
        name: 'Create a customer',
        description: 'Create a customer. Optionally include usecases array to attach usecase configs. Data is saved across two tables: tenant_config and tenant_usecase_config.',
        requestBody: {
          type: 'json',
          example: {
            "customer_id": "customer_001",
            "company_name": "Acme Corp",
            "email": "pqr@org.com",
            "api_key": "8LM1QMtPdI5C0feQ3sgoq9jgoKs0y2evJStI6f0b",
            "is_active": true,
            "usecases": [
              {
                "is_active": true,
                "usecase_id": "forward_email_triage_agent",
                "usecase_version": "v1"
              }
            ]
          },
          schema: {
            customer_id: { type: 'string', minLength: 1, description: "Unique ID for the customer" },
            company_name: { type: 'string', minLength: 1, description: "Company display name" },
            email: { type: 'string', format: 'email', description: "Contact email" },
            api_key: { type: 'string', minLength: 1, description: "API Key for authentication" },
            is_active: { type: 'boolean', default: true, description: "Whether the customer is active" },
            usecases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  is_active: { type: 'boolean' },
                  usecase_id: { type: 'string' },
                  usecase_version: { type: 'string' }
                }
              }
            }
          }
        },
        responses: [
          {
            code: 201,
            description: 'Successful Response',
            example: {
              "customer_id": "string",
              "company_name": "string",
              "email": "string",
              "api_key": "string",
              "is_active": true,
              "created_at": "string",
              "usecases": [
                {
                  "usecase_id": "forward_email_triage_agent",
                  "usecase_version": "v1",
                  "is_active": true,
                  "custom_prompt_template_arn": "string",
                  "custom_prompt_template_version": "string",
                  "custom_temperature": 0,
                  "custom_top_p": 0,
                  "custom_max_tokens": 0,
                  "custom_knowledge_bases": "string",
                  "allowed_models": {
                    "default": "us.anthropic.claude-3-5-haiku-20241022-v1:0"
                  }
                }
              ]
            },
            schema: {
              customer_id: { type: 'string' },
              company_name: { type: 'string' },
              email: { type: 'string' },
              api_key: { type: 'string' },
              is_active: { type: 'boolean' },
              created_at: { type: 'string', format: 'date-time' },
              usecases: { type: 'array', items: { type: 'object' } }
            }
          },
          {
            code: 422,
            description: 'Validation Error',
            example: {
              "detail": [
                {
                  "loc": ["string", 0],
                  "msg": "string",
                  "type": "string",
                  "input": "string",
                  "ctx": {}
                }
              ]
            }
          }
        ]
      },
      {
        id: 'get-agent-detail',
        method: 'GET',
        path: '/customers/get_agent_api_detail',
        name: 'Get Agent API Detail',
        description: 'Returns the API integration details for a customer\'s usecase including endpoint, headers, request and response schema.',
        parameters: [
          { name: 'customer_id', type: 'string', required: true, description: 'Customer Id', in: 'query' },
          { name: 'usecase_id', type: 'string', required: true, description: 'Usecase Id', in: 'query' }
        ]
      },
      {
        id: 'get-customer',
        method: 'GET',
        path: '/customers/{customer_id}',
        name: 'Get a customer',
        description: 'Fetch a customer and all their usecase configs.',
        parameters: [
          { name: 'customer_id', type: 'string', required: true, description: 'Customer Id', in: 'path' }
        ]
      },
      {
        id: 'update-customer',
        method: 'PUT',
        path: '/customers/{customer_id}',
        name: 'Update a customer',
        description: 'Update customer fields and upsert usecase configs.',
        parameters: [
          { name: 'customer_id', type: 'string', required: true, description: 'Customer Id', in: 'path' }
        ],
        requestBody: {
          type: 'json',
          schema: {
            company_name: { type: 'string', minLength: 1, example: 'Acme Corp Updated' },
            email: { type: 'string', format: 'email', example: 'new@org.com' },
            is_active: { type: 'boolean', example: false }
          }
        }
      },
      {
        id: 'delete-customer',
        method: 'DELETE',
        path: '/customers/{customer_id}',
        name: 'Delete a customer',
        description: 'Delete a customer. Usecase configs are not auto-deleted.',
        parameters: [
          { name: 'customer_id', type: 'string', required: true, description: 'Customer Id', in: 'path' }
        ]
      }
    ]
  },
  {
    id: 'ai-gateway',
    name: 'AI Gateway',
    endpoints: [
      {
        id: 'invoke-agent',
        method: 'POST',
        path: '/agent/{usecase_id}',
        name: 'Invoke Agent API',
        description: 'Forwards the request body to API_GATEWAY_URL/agent/{usecase_id}. Pass the customer API key via the x-api-key header.',
        parameters: [
          { name: 'usecase_id', type: 'string', required: true, description: 'Usecase Id', in: 'path' },
          { name: 'x-api-key', type: 'string', required: true, description: 'Customer API key', in: 'header' }
        ],
        requestBody: {
          type: 'json',
          schema: {
            messages: { type: 'array', items: { type: 'object' } },
            temperature: { type: 'number', default: 0.7 }
          }
        }
      },
      {
        id: 'invoke-llm',
        method: 'POST',
        path: '/llm/invoke',
        name: 'Invoke Direct LLM',
        description: 'Forwards the request body to API_GATEWAY_URL/llm/invoke. Pass the customer API key via the x-api-key header.',
        parameters: [
          { name: 'x-api-key', type: 'string', required: true, description: 'Customer API key', in: 'header' }
        ],
        requestBody: {
          type: 'json',
          schema: {
            model: { type: 'string', example: 'us.anthropic.claude-3-5-haiku-20241022-v1:0' },
            input: { type: 'string', example: 'Hello, how are you?' },
            parameters: { type: 'object' }
          }
        }
      }
    ]
  },
  {
    id: 'health',
    name: 'System Health',
    endpoints: [
      {
        id: 'health-check',
        method: 'GET',
        path: '/health',
        name: 'Health check',
        description: 'Returns the current status of the API service.'
      }
    ]
  }
];

export const glossary: GlossaryItem[] = [
  { term: 'APN', definition: 'Access Point Name. The name of a gateway between a mobile network and another computer network, frequently the public Internet.', category: 'Network' },
  { term: 'ICCID', definition: 'Integrated Circuit Card Identifier. A unique 19 or 20-digit number used to identify a SIM card.', category: 'SIM' },
  { term: 'IMEI', definition: 'International Mobile Equipment Identity. A unique number to identify mobile phones and some satellite phones.', category: 'Device' },
  { term: 'MSISDN', definition: 'Mobile Station International Subscriber Directory Number. A number uniquely identifying a subscription in a GSM or a UMTS mobile network.', category: 'SIM' }
];
