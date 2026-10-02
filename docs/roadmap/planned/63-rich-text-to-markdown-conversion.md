<!-- plan id="63" status="planned" summary="Preserve current and historical prose through schema v6, regenerate seeds and retire Rich Text" -->
# Slice 63 — Rich Text to Markdown conversion and retirement (Slice 59 Stage C2)

## Goal

Convert every current and historical Rich Text section to Markdown without losing visible prose,
then retire Rich Text creation and registration (Stage C2 of [Slice 59](59-markdown-and-work-navigation.md)).

## Spec sections

§§11, 14 (contracts and owned-file upgrades), 27, 29–31 (sections, shortcuts, history and recovery),
54 (MCP writes), 66 (section structure), 69 and 77 (verification and actual use).

## Build

- Add a named v5→v6 converter over live sections and every enumerated history payload/snapshot.
  Escape legacy prose rather than reinterpret it; preserve IDs, labels, attribution and timestamps.
- Freeze v4→v5 output to literal v5 opaque data and validate only after the extended upgrade chain;
  retain owner locks, backup and validate-before-replace behavior. Diagnose unprovable preservation.
- Regenerate current seeds, retire the Rich Text registration and narrowly refuse new rich-text
  creates through domain/HTTP/MCP. Keep foreign/malformed config recoverable with visible guidance.
- Update living spec, architecture, decisions and guides with the delivered conversion behavior.

## Done when

Upgrading copies from every supported version preserves prose and history through restart; a
repeat upgrade changes no bytes. Converted history Undo/Redo recreates Markdown with the same
identities and historical labels. New browser/HTTP/MCP writes use source config and reject new
Rich Text. Recovery, read-only shortcuts, permissions and all required checks remain green;
realistic converted data is exercised in the app and the bundle remains below its ceiling.

## Do not

- Rewrite historical fixtures or older upgrade semantics, discard unknown config, or perform
  recursive string replacement over history.
- Add richer editing, Markdown in task/reflection bodies, history relabeling, merge/autosave,
  shortcuts on Work (Stage D), Sub-Projects retirement (Stage E) or a larger bundle budget.
