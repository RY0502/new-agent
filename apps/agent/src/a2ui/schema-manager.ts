/**
 * A2UI v0.9 Schema Manager
 * Manages catalog loading, system prompt generation, and component validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

export interface CatalogConfig {
  name: string;
  catalogPath: string;
  examplesPath?: string;
}

export interface Catalog {
  catalogId: string;
  components: Record<string, any>;
  functions: any[];
  theme: Record<string, any>;
}

export interface ComponentMessage {
  [componentName: string]: any;
}

export class A2uiSchemaManager {
  private version: string;
  private catalogs: Map<string, Catalog>;
  private examples: Map<string, any[]>;
  private selectedCatalogId: string | null;

  constructor(version: string, catalogConfigs: CatalogConfig[]) {
    this.version = version;
    this.catalogs = new Map();
    this.examples = new Map();
    this.selectedCatalogId = null;

    // Load catalogs
    for (const config of catalogConfigs) {
      this.loadCatalog(config);
    }

    // Auto-select first catalog if available
    if (this.catalogs.size > 0) {
      this.selectedCatalogId = Array.from(this.catalogs.keys())[0];
    }
  }

  private loadCatalog(config: CatalogConfig): void {
    try {
      const catalogData = fs.readFileSync(config.catalogPath, 'utf-8');
      const catalog: Catalog = JSON.parse(catalogData);
      
      this.catalogs.set(catalog.catalogId, catalog);

      // Load examples if provided
      if (config.examplesPath) {
        const examplesDir = path.dirname(config.examplesPath);
        const examplePattern = path.basename(config.examplesPath);
        
        if (fs.existsSync(examplesDir)) {
          const files = fs.readdirSync(examplesDir);
          const examples: any[] = [];
          
          for (const file of files) {
            if (file.endsWith('.json')) {
              const examplePath = path.join(examplesDir, file);
              const exampleData = fs.readFileSync(examplePath, 'utf-8');
              examples.push(JSON.parse(exampleData));
            }
          }
          
          this.examples.set(catalog.catalogId, examples);
        }
      }
    } catch (error) {
      console.error(`Failed to load catalog from ${config.catalogPath}:`, error);
      throw error;
    }
  }

  public generateSystemPrompt(roleDescription: string): string {
    if (!this.selectedCatalogId) {
      throw new Error('No catalog selected');
    }

    const catalog = this.catalogs.get(this.selectedCatalogId);
    if (!catalog) {
      throw new Error(`Catalog ${this.selectedCatalogId} not found`);
    }

    const examples = this.examples.get(this.selectedCatalogId) || [];

    const componentDescriptions = Object.entries(catalog.components)
      .map(([name, schema]) => {
        return `- **${name}**: ${schema.description || 'No description'}`;
      })
      .join('\n');

    const exampleSection = examples.length > 0
      ? `\n\n## Examples\n\n${examples.map((ex, idx) => 
          `### Example ${idx + 1}\nUser: ${ex.user_query}\nAgent Response:\n\`\`\`json\n${JSON.stringify(ex.agent_response, null, 2)}\n\`\`\`\n`
        ).join('\n')}`
      : '';

    return `${roleDescription}

## A2UI Component Catalog (v${this.version})

You must respond using A2UI components from the catalog: ${catalog.catalogId}

### Available Components:
${componentDescriptions}

### Response Format:
Your response MUST be a JSON object with a "components" array containing component objects.

Example structure:
\`\`\`json
{
  "components": [
    {
      "ComponentName": {
        "property1": "value1",
        "property2": "value2"
      }
    }
  ]
}
\`\`\`

### Component Schemas:
${JSON.stringify(catalog.components, null, 2)}
${exampleSection}

### Critical Rules:
1. Output ONLY valid JSON matching the component schemas
2. Use the exact component names and property names from the catalog
3. Choose the most appropriate component for the user's query
4. For text responses, use the Result component
5. For lists, use the List component
6. For tabular data, use the Table component
7. For code, use the Code component with the appropriate language
8. Do NOT output markdown, plain text, or any format other than the specified JSON structure
9. Ensure all required properties are included for each component
`;
  }

  public getSelectedCatalog(): Catalog | null {
    if (!this.selectedCatalogId) return null;
    return this.catalogs.get(this.selectedCatalogId) || null;
  }

  public selectCatalog(catalogId: string): void {
    if (!this.catalogs.has(catalogId)) {
      throw new Error(`Catalog ${catalogId} not found`);
    }
    this.selectedCatalogId = catalogId;
  }

  public getCatalogIds(): string[] {
    return Array.from(this.catalogs.keys());
  }

  public validateComponent(componentMessage: ComponentMessage): { valid: boolean; errors?: string[] } {
    const catalog = this.getSelectedCatalog();
    if (!catalog) {
      return { valid: false, errors: ['No catalog selected'] };
    }

    const componentName = Object.keys(componentMessage)[0];
    const componentData = componentMessage[componentName];

    if (!catalog.components[componentName]) {
      return { 
        valid: false, 
        errors: [`Component "${componentName}" not found in catalog. Available: ${Object.keys(catalog.components).join(', ')}`] 
      };
    }

    // Basic validation - in production, use a proper JSON Schema validator
    const schema = catalog.components[componentName];
    const errors: string[] = [];

    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in componentData)) {
          errors.push(`Missing required property: ${requiredProp}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

/**
 * Parse and validate LLM response to A2UI component parts
 */
export function parseResponseToParts(
  llmResponse: string,
  catalog: Catalog | null
): ComponentMessage[] {
  try {
    // Try to extract JSON from the response
    let jsonStr = llmResponse.trim();
    
    // Remove markdown code fences if present
    jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Find JSON object boundaries
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.components || !Array.isArray(parsed.components)) {
      console.warn('Response missing components array, wrapping in default structure');
      return [{ Result: { content: llmResponse } }];
    }

    return parsed.components;
  } catch (error) {
    console.error('Failed to parse LLM response as A2UI:', error);
    // Fallback to Result component with raw text
    return [{ Result: { content: llmResponse } }];
  }
}
