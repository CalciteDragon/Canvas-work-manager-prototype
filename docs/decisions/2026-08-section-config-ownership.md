# A section config is an object at rest, replaced whole on write

**Question**

§29 gives `createDefaultConfig(): unknown` to the section definition, and
`ProjectSection.config` was `z.unknown()` to match. Once sections can be written through an
API, what does the contract actually promise about a config?

**Options tested**

- *Leave `config` as `z.unknown()` everywhere*: rejected once the write inputs existed. On
  an update, `unknown` makes "absent" and "explicitly `undefined`" indistinguishable after
  parsing, and leaves `null` ambiguous between "clear it" and "a legitimate config value" —
  exactly where the update semantics have to be unambiguous.
- *Type each section's config in `packages/contracts`*: rejected. It would make adding a
  section type touch that package, which is the change §30 exists to prevent.
- *An object at rest and on write, with keys still opaque*: chosen.
  `SectionConfigSchema = z.record(z.string(), z.unknown())`, used by `ProjectSection.config`
  and by both write inputs.

**What we learned**

The narrowing cost nothing: every config value in every committed seed was `{}` when it
landed, so no existing data had to change. (The same slice then added rich-text sections
whose configs carry a `text` key — still objects, still opaque to this package.) And it
closes a real gap: `config` could previously hold `[]`, `"text"` or `null` at rest,
values no input schema could produce or edit, so a hand-edited file could reach a state the
API could never repair.

Making the field required rather than optional follows from the same reasoning: an absent
config and an empty config are not different states.

§29's `createDefaultConfig(): unknown` stays verbatim. The one call site that persists its
result parses it through `SectionConfigSchema`, so a definition that returns a non-object
fails loudly at the boundary instead of reaching the host — and in the app it surfaces as a
visible section error rather than taking the canvas down.

**Current decision**

A config is an object whose keys belong to the section definition, parsed only inside that
section's own folder (`rich-text-config.ts` is the worked example, including tolerating a
malformed config by falling back to its default). Updates replace it whole: the definition
owns the keys, so nothing in the domain or the contract can decide which of them a partial
write meant to keep.

**Confidence**

High for the storage shape; medium for replace-whole, which is untested against a section
type with more than one setting.

**Revisit when**

A section type has several independent settings and a partial write becomes worth wanting —
Timeline or Progress (§30) are the likely first.
