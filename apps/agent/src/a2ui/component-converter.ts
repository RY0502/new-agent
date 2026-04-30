/**
 * Converts A2UI v0.9 component format to legacy custom format
 * This allows gradual migration while maintaining compatibility with existing renderer
 */

import { ComponentMessage } from './schema-manager';

export function convertToLegacyFormat(components: ComponentMessage[]): string {
  const parts: string[] = [];
  
  // Always start with section header
  parts.push('<section>Answer</section>');

  for (const component of components) {
    const componentName = Object.keys(component)[0];
    const componentData = component[componentName];

    switch (componentName) {
      case 'Result':
        parts.push(`<a2-result>${componentData.content}</a2-result>`);
        break;

      case 'List':
        parts.push(`<a2-list>${JSON.stringify(componentData.items)}</a2-list>`);
        break;

      case 'Table':
        const tableData = {
          columns: componentData.columns,
          rows: componentData.rows
        };
        parts.push(`<a2-table>${JSON.stringify(tableData)}</a2-table>`);
        break;

      case 'Tabs':
        const tabsData = {
          tabItems: componentData.tabItems
        };
        parts.push(`<a2-tabs>${JSON.stringify(tabsData)}</a2-tabs>`);
        break;

      case 'Code':
        const language = componentData.language || 'text';
        parts.push(`<a2-code language="${language}">${componentData.code}</a2-code>`);
        break;

      case 'Video':
        const videoData = {
          id: componentData.id,
          component: {
            Video: {
              url: {
                literalString: componentData.url
              }
            }
          }
        };
        parts.push(`<a2-video>${JSON.stringify(videoData)}</a2-video>`);
        break;

      case 'Progress':
        const label = componentData.label || '';
        parts.push(`<a2-progress value="${componentData.value}">${label}</a2-progress>`);
        break;

      case 'Image':
        const imageData = {
          id: componentData.id,
          component: {
            Image: {
              url: {
                literalString: componentData.url
              },
              fit: componentData.fit || 'cover',
              usageHint: componentData.usageHint || 'content'
            }
          }
        };
        parts.push(`<a2-image>${JSON.stringify(imageData)}</a2-image>`);
        break;

      case 'Chart':
        const chartData = {
          id: componentData.id,
          component: {
            Chart: {
              type: componentData.type || 'bar',
              title: componentData.title || '',
              subtitle: componentData.subtitle || '',
              xLabel: componentData.xLabel || '',
              yLabel: componentData.yLabel || '',
              data: Array.isArray(componentData.data) ? componentData.data : []
            }
          }
        };
        parts.push(`<a2-chart>${JSON.stringify(chartData)}</a2-chart>`);
        break;

      case 'Stat':
        parts.push(`<a2-stat>${JSON.stringify({ items: Array.isArray(componentData.items) ? componentData.items : [] })}</a2-stat>`);
        break;

      case 'Timeline':
        parts.push(`<a2-timeline>${JSON.stringify({ events: Array.isArray(componentData.events) ? componentData.events : [] })}</a2-timeline>`);
        break;

      case 'Callout': {
        const variant = String(componentData.variant || 'info').replace(/"/g, '&quot;');
        const heading = String(componentData.heading || '').replace(/"/g, '&quot;');
        const content = String(componentData.content || '');
        parts.push(`<a2-callout variant="${variant}" heading="${heading}">${content}</a2-callout>`);
        break;
      }

      case 'Steps':
        parts.push(`<a2-steps>${JSON.stringify({ current: componentData.current, steps: Array.isArray(componentData.steps) ? componentData.steps : [] })}</a2-steps>`);
        break;

      case 'Badges':
        parts.push(`<a2-badges>${JSON.stringify({ items: Array.isArray(componentData.items) ? componentData.items : [] })}</a2-badges>`);
        break;

      default:
        console.warn(`Unknown component type: ${componentName}`);
        // Fallback to result
        parts.push(`<a2-result>${JSON.stringify(componentData)}</a2-result>`);
    }
  }

  return parts.join('\n');
}

/**
 * Extract component type from legacy format (for backward compatibility)
 */
export function detectComponentType(text: string): string {
  if (text.includes('<a2-chart>')) return 'chart';
  if (text.includes('<a2-table>')) return 'table';
  if (text.includes('<a2-list>')) return 'list';
  if (text.includes('<a2-tabs>')) return 'tabs';
  if (text.includes('<a2-code')) return 'code';
  if (text.includes('<a2-video>')) return 'video';
  if (text.includes('<a2-progress')) return 'progress';
  return 'result';
}
