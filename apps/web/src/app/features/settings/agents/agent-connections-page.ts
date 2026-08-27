import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlaceholderPage } from '../../../shared/components/placeholder-page/placeholder-page';

/** MCP agent connections and their permissions arrive in Slice 13 (§52, §53). */
@Component({
  selector: 'app-agent-connections-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderPage],
  template: `<app-placeholder-page heading="Agent connections" note="MCP agent connections and their permissions arrive in Slice 13 (§52, §53)." />`,
})
export class AgentConnectionsPage {}
