/** Read-only grouping of the existing authorized catalog; codes remain authoritative. */
export function PermissionGroups({
  collapsible = false,
  codes,
  emptyLabel = 'None',
}: {
  collapsible?: boolean;
  codes: readonly string[];
  emptyLabel?: string;
}) {
  if (codes.length === 0) return <p>{emptyLabel}</p>;
  const groups = new Map<string, string[]>();
  for (const code of codes) {
    const group = code.split(':')[0] ?? code;
    groups.set(group, [...(groups.get(group) ?? []), code]);
  }
  return (
    <div className="admin-permissions">
      {[...groups].map(([group, permissions]) => {
        const list = (
          <ul>
            {permissions.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        );
        return collapsible ? (
          <details key={group} className="admin-access-disclosure">
            <summary>{group}</summary>
            {list}
          </details>
        ) : (
          <section key={group}>
            <h3>{group}</h3>
            {list}
          </section>
        );
      })}
    </div>
  );
}
