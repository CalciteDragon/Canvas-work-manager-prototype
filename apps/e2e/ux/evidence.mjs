/** Collect independent artifacts without concealing partial capture failures. */
export async function collectEvidence(collectors) {
  const artifacts = {};
  const errors = {};
  for (const [name, collect] of Object.entries(collectors)) {
    try { artifacts[name] = await collect(); }
    catch (error) { errors[name] = error instanceof Error ? error.message : String(error); }
  }
  return { status: Object.keys(errors).length ? 'incomplete' : 'captured', artifacts, errors };
}
