import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceCss = readFileSync(join(process.cwd(), 'src/ui/workspace.css'), 'utf8');
const missionCss = readFileSync(join(process.cwd(), 'src/missions/mission.css'), 'utf8');

describe('workspace scroll ownership', () => {
  it('keeps fill panes sized as scroll owners while allowing boundary handoff', () => {
    expect(workspaceCss).toMatch(
      /\.app-shell\[data-layout='fill'\] \.ui-workspace__pane-body \{[\s\S]*?flex: 1 1 auto;[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior-y: auto;[\s\S]*?\}/,
    );
    expect(workspaceCss).not.toContain('overscroll-behavior: contain;');
  });

  it('allows the Missions process detail to hand scrolling back to the page', () => {
    expect(missionCss).toMatch(
      /\.mission-pipeline-workspace__detail \{[\s\S]*?max-block-size: min\(70vh, 48rem\);[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior-y: auto;[\s\S]*?\}/,
    );
    expect(missionCss).not.toContain('overscroll-behavior: contain;');
  });
});
