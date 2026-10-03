# A Markdown section's config is validated on every write

**Question**

Slice 63 friction (`note-2026-10-02-003`): a Markdown section stored with a key besides `markdown`
became read-only prose with no next step. Converted Rich Text was one source. Any agent that sent
`create_section` or `update_section` a config with an extra key was another, because nothing below
the web app checked a config against its section type. Should writes refuse such a config, and
what should happen to the legacy data that already carried one?

**Options tested**

- *Let the person recover in the UI* (a "remove unrecognised data" action on the unreadable note):
  rejected (user, 2026-10-02). It treats the symptom and leaves agents able to create the state.
- *Refuse a malformed config where it is written*: adopted (user, 2026-10-02). It suits agents as
  first-class users: they get a refusal naming the key instead of quietly creating a section no
  one can edit.
- *Validate all seven registered types*: rejected (user, 2026-10-02). The six others read no config
  today. Refusing theirs gains nothing yet, and it would remove the "view with display settings"
  case that recovery tests rely on. A type gets a schema once it owns config.
- *Type `config` per type in the input schemas* (a discriminated union): rejected. It would close
  §30's open type string. A domain refusal reaches every caller the same way.
- *Keep extras in the converter and show the prose read-only*: rejected (user, 2026-10-02). No
  legacy data beside the prose is worth saving, so "prose beside extras" should not be a state at
  all.

**What we learned**

- The domain could not check config before because the shape lived only in the web section
  folder, which the domain cannot import. Moving the one schema that matters into contracts costs
  one map entry and keeps a single definition.
- Only the web app saved Markdown correctly. The real risk was agents and HTTP callers, which
  passed anything.

**Current decision**

`packages/contracts` defines `MarkdownConfigSchema` (strict `{ markdown: string }`) and
`SECTION_CONFIG_SCHEMAS`, which holds only `markdown`. `sectionConfigRefusal(type, config)` returns
a sentence or `undefined`:

- an empty config is always accepted;
- an undeclared type is never checked, whether registered or not.

`SectionService.add` checks after the retired-type refusal and before any lookup. `update` checks
after the section, archive and project checks, whenever a config is sent, including one equal to
what is stored. Both throw `DomainRuleError`, so browser, HTTP (409 `rule_violation`) and MCP get
the same refusal. Undo, Redo, Restore and Duplicate reproduce state that already exists and are not
checked. The store does not refuse a document holding a malformed config.

The v5 → v6 converter writes only `{}` or `{ markdown }`. Extras are dropped, a config without a
string `text` empties, and `discardedConfigs` counts each location
([amendment](2026-10-schema-version-6-markdown-conversion.md)). Markdown's unreadable state shows
only its guidance note; it no longer renders prose beside an extra key
([amendment](2026-10-markdown-source-and-rendering.md)). This narrows the
[config-ownership decision](2026-08-section-config-ownership.md): a type that owns config declares
its schema in contracts. The spec's §14, §29 and §30 were updated in the same change.

**Confidence**

High. The refusal is one pure function behind one service, covered in contracts, domain, MCP and
HTTP tests. The live data file was scanned on 2026-10-02 and holds no nonconforming Markdown config.

**Revisit when**

- Another type starts reading config: give it a schema here.
- A hand-edited file holds a malformed Markdown config often enough to want a load-time refusal or
  a cleanup.
