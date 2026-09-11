# How <system name> works

<!-- Mechanism and maintenance. Link symbols into the Compodoc output with relative paths
     (../../api/… from a level-1 folder, ../../../api/… from level 2). `pnpm docs:check`
     verifies each linked symbol exists. -->

## Runtime flow

<Numbered steps of the main path, naming the symbol that performs each one.>

1. <step>
2. <step>

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `<Name>` | class / injectable / component / interface / function | <one line> | [API](../../api/classes/<Name>.html) |

## Dependencies

**Depends on**

- [<system>](../<system>/overview.md) — <for what>

**Depended on by**

- [<system>](../<system>/overview.md) — <for what>

## Invariants and lints

- <A rule the code enforces, and the test or script that enforces it.>

## Commands

```bash
<command>   # <what it does>
```

## Changing it

- <Where to start for the most common change, and the test to write first.>
- <The trap a newcomer falls into, and the file that explains it.>
