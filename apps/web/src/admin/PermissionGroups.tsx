/** Read-only grouping of the existing authorized catalog; codes remain authoritative. */
export function PermissionGroups({ codes }: { codes: readonly string[] }) {
  if (codes.length === 0) return <p>None</p>;
  const groups = new Map<string, string[]>();
  for (const code of codes) {
    const group = code.split(':')[0] ?? code;
    groups.set(group, [...(groups.get(group) ?? []), code]);
  }
  return (
    <div className="admin-permissions">
      {[...groups].map(([group, permissions]) => (
        <section key={group}>
          <h3>{group}</h3>
          <ul>
            {permissions.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
