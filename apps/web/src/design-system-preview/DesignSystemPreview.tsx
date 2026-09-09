import type { CSSProperties } from 'react';

import {
  Button,
  Checkbox,
  EmptyState,
  InlineMessage,
  Select,
  Skeleton,
  StatusBadge,
  TextArea,
  TextField,
} from '../ui/index.js';

const colors = [
  ['Canvas', '--color-canvas'],
  ['Surface', '--color-surface'],
  ['Surface subtle', '--color-surface-subtle'],
  ['Border', '--color-border'],
  ['Text', '--color-text'],
  ['Text secondary', '--color-text-secondary'],
  ['Brand', '--color-brand'],
  ['Brand subtle', '--color-brand-subtle'],
  ['Success', '--color-success'],
  ['Warning', '--color-warning'],
  ['Danger', '--color-danger'],
  ['Info', '--color-info'],
] as const;

function Swatch({ label, token }: { label: string; token: string }) {
  return (
    <div className="preview-swatch">
      <span
        aria-hidden="true"
        className="preview-swatch__color"
        style={{ '--swatch-color': `var(${token})` } as CSSProperties}
      />
      <span>{label}</span>
      <code>{token}</code>
    </div>
  );
}

export function DesignSystemPreview() {
  return (
    <main className="preview-page">
      <header className="preview-hero">
        <div>
          <p className="preview-eyebrow">HireMe UI/UX v1 · Phase 1</p>
          <h1>Calm systems for consequential work.</h1>
          <p className="preview-lede">
            A synthetic, API-free review harness for HireMe’s visual language, foundation
            primitives, and internal-to-public density range.
          </p>
        </div>
        <StatusBadge tone="info">Development preview</StatusBadge>
      </header>

      <nav className="preview-nav" aria-label="Preview sections">
        <a href="#color">Color</a>
        <a href="#type">Type</a>
        <a href="#controls">Controls</a>
        <a href="#forms">Forms</a>
        <a href="#status">Status</a>
        <a href="#data">Data</a>
        <a href="#density">Density</a>
      </nav>

      <section className="preview-section" id="color">
        <div className="preview-section__heading">
          <p className="preview-kicker">01 · Foundations</p>
          <h2>Neutral first, brand with intent</h2>
          <p>The teal accent guides action and focus; it does not tint every module.</p>
        </div>
        <div className="preview-swatches">
          {colors.map(([label, token]) => (
            <Swatch key={token} label={label} token={token} />
          ))}
        </div>
      </section>

      <section className="preview-section" id="type">
        <div className="preview-section__heading">
          <p className="preview-kicker">02 · Typography</p>
          <h2>Compact hierarchy, readable rhythm</h2>
        </div>
        <div className="preview-type-specimen">
          <div>
            <span>Page title · 32/38</span>
            <p className="preview-type-page">Recruitment operations</p>
          </div>
          <div>
            <span>Section title · 24/31</span>
            <p className="preview-type-section">Candidate pipeline</p>
          </div>
          <div>
            <span>Subsection · 18/23</span>
            <p className="preview-type-subsection">Upcoming interviews</p>
          </div>
          <div>
            <span>Body · 16/25</span>
            <p className="preview-type-body">Clear language supports confident decisions.</p>
          </div>
          <div>
            <span>Compact body · 14/22</span>
            <p className="preview-type-compact">Updated today by Operations</p>
          </div>
          <div className="preview-type-meta-row">
            <div>
              <span>Label · 14/18</span>
              <p className="preview-type-label">Responsible recruiter</p>
            </div>
            <div>
              <span>Caption · 12/19</span>
              <p className="preview-type-caption">Last synced 09:42</p>
            </div>
            <div>
              <span>KPI · 32/38</span>
              <p className="preview-type-kpi">1,248</p>
            </div>
          </div>
        </div>
      </section>

      <section className="preview-section" id="controls">
        <div className="preview-section__heading">
          <p className="preview-kicker">03 · Controls</p>
          <h2>Few variants, explicit states</h2>
        </div>
        <div className="preview-control-groups">
          <div className="preview-control-row">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="quiet">Quiet action</Button>
            <Button variant="danger">Destructive</Button>
            <Button aria-label="Close preview item" size="compact" variant="secondary">
              ×
            </Button>
          </div>
          <div className="preview-control-row">
            <Button disabled>Disabled</Button>
            <Button loading loadingLabel="Saving…">
              Save changes
            </Button>
            <Button size="compact" variant="secondary">
              Compact action
            </Button>
          </div>
        </div>
      </section>

      <section className="preview-section" id="forms">
        <div className="preview-section__heading">
          <p className="preview-kicker">04 · Forms</p>
          <h2>Labels and recovery belong with the control</h2>
        </div>
        <form className="preview-form" onSubmit={(event) => event.preventDefault()}>
          <TextField
            hint="Use a shared team address when appropriate."
            label="Contact email"
            placeholder="operations@example.test"
            type="email"
          />
          <Select defaultValue="review" label="Pipeline state">
            <option value="review">CV to review</option>
            <option value="interview">HR interview</option>
            <option value="presented">Presented to client</option>
          </Select>
          <TextField
            defaultValue="Incorrect value"
            error="Enter a valid internal reference."
            label="Internal reference"
          />
          <TextArea
            hint="Keep this note factual and concise."
            label="Context note"
            placeholder="Add relevant operational context…"
            rows={4}
          />
          <Checkbox
            defaultChecked
            hint="This example changes no persisted setting."
            label="Send an internal notification"
          />
          <Button type="submit">Review synthetic record</Button>
        </form>
      </section>

      <section className="preview-section" id="status">
        <div className="preview-section__heading">
          <p className="preview-kicker">05 · Status and feedback</p>
          <h2>Color is reinforced by text and structure</h2>
        </div>
        <div className="preview-badges" aria-label="Status badge examples">
          <StatusBadge>Draft</StatusBadge>
          <StatusBadge tone="success">Active</StatusBadge>
          <StatusBadge tone="warning">Needs review</StatusBadge>
          <StatusBadge tone="danger">Blocked</StatusBadge>
          <StatusBadge tone="info">Scheduled</StatusBadge>
        </div>
        <div className="preview-messages">
          <InlineMessage title="Information">
            Filters apply only to authorized records.
          </InlineMessage>
          <InlineMessage title="Saved" tone="success">
            The synthetic preview state is up to date.
          </InlineMessage>
          <InlineMessage title="Review needed" tone="warning">
            Confirm the source before continuing.
          </InlineMessage>
          <InlineMessage title="Unable to continue" tone="danger">
            Correct the highlighted field and try again.
          </InlineMessage>
        </div>
      </section>

      <section className="preview-section" id="data" data-density="internal-compact">
        <div className="preview-section__heading preview-section__heading--inline">
          <div>
            <p className="preview-kicker">06 · Data</p>
            <h2>Compact without becoming brittle</h2>
          </div>
          <div className="preview-control-row">
            <Button size="compact" variant="secondary">
              Filter
            </Button>
            <Button size="compact">Add candidate</Button>
          </div>
        </div>
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead>
              <tr>
                <th className="preview-table__selection" scope="col">
                  <span className="sr-only">Selection</span>
                </th>
                <th scope="col">Candidate</th>
                <th scope="col">Role</th>
                <th scope="col">Stage</th>
                <th scope="col">Owner</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td aria-hidden="true" />
                <td>Candidate 1042</td>
                <td>Operations lead</td>
                <td>
                  <StatusBadge tone="info">HR interview</StatusBadge>
                </td>
                <td>Recruiter A</td>
                <td>Today</td>
              </tr>
              <tr className="is-hovered">
                <td aria-hidden="true" />
                <td>Candidate 1043</td>
                <td>Finance analyst</td>
                <td>
                  <StatusBadge tone="warning">Review</StatusBadge>
                </td>
                <td>Recruiter B</td>
                <td>Yesterday</td>
              </tr>
              <tr aria-selected="true" className="is-selected">
                <td className="preview-table__selection">
                  <span
                    aria-hidden="true"
                    className="preview-table__selection-marker"
                    title="Selected"
                  >
                    ✓
                  </span>
                </td>
                <td>Candidate 1044</td>
                <td>Product designer</td>
                <td>
                  <StatusBadge tone="success">Presented</StatusBadge>
                </td>
                <td>Recruiter A</td>
                <td>2 days ago</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="preview-data-states">
          <div className="preview-state-sample">
            <span>Loading</span>
            <Skeleton label="Loading candidate rows" />
          </div>
          <div className="preview-state-sample">
            <EmptyState
              action={<Button variant="secondary">Clear filters</Button>}
              title="No records in scope"
            >
              Adjust the current filters or clear them to view authorized records.
            </EmptyState>
          </div>
        </div>
      </section>

      <section className="preview-section" id="density">
        <div className="preview-section__heading">
          <p className="preview-kicker">07 · Density and layout</p>
          <h2>One system, three working rhythms</h2>
        </div>
        <div className="preview-density-grid">
          <article className="preview-density-sample" data-density="internal-compact">
            <span>Internal compact</span>
            <h3>Pipeline queue</h3>
            <p>Dense tables, filters, and repeat actions.</p>
            <Button size="compact">Open queue</Button>
          </article>
          <article className="preview-density-sample" data-density="internal-standard">
            <span>Internal standard</span>
            <h3>Candidate detail</h3>
            <p>Balanced forms, metadata, and decision context.</p>
            <Button>Review profile</Button>
          </article>
          <article
            className="preview-density-sample preview-density-sample--public"
            data-density="public-spacious"
          >
            <span>Public spacious</span>
            <h3>Build your next chapter with HireMe.</h3>
            <p>A warmer reading rhythm with the same brand, type, states, and interaction logic.</p>
            <Button>Explore opportunity</Button>
          </article>
        </div>
        <div className="preview-elevation">
          <div className="preview-normal-surface">
            <span>Normal surface</span>
            <p>Hierarchy comes from spacing, tone, and a quiet border.</p>
          </div>
          <aside className="preview-popover" aria-label="Popover elevation sample">
            <span>Popover</span>
            <strong>Temporary elevation</strong>
            <p>Shadow is reserved for content that genuinely floats.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
