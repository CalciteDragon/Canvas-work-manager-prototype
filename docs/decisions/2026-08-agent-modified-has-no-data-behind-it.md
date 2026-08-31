# §4's *Agent Modified* task row has no data behind it

**Question**

§4 names seven `TaskRow` variants: Normal, Overdue, Completed, High Priority, Selected,
Compact and **Agent Modified**. The story set ships six. Why?

**Options tested**

- *Add an `agentModified` input to `TaskRow`*: rejected. It would be an input with no source
  — nothing in the application could set it truthfully, so every story would be showing a
  state the running app cannot reach.
- *Add actor attribution to the `Task` contract*: rejected, and this is the real content of
  the question. `packages/contracts/src/task.ts` carries no actor field, deliberately: who
  changed a task lives on `ActivityFeedEntry` (§57), which is where §52's connection
  attribution already resolves. Adding it to the task record means deciding what "modified by
  an agent" *means* — the last writer? any writer ever? for how long? — and that is a product
  question, not a story.
- *Ship six and record the deviation*: chosen.

**What we learned**

Slice 16 asked the same question from the other end. Its §79 note wondered whether agent
actions "need attribution at the point of change … Worth a Slice 22 experiment" — that note
and this entry are the same finding reached twice, which is a reasonable signal that the
question is real and that guessing at it in a story would have been the wrong way to answer.

The six variants that do ship are all states the application genuinely produces, and the
story set says so in its own header rather than counting to six against a spec that says
seven.

**Current decision**

Six variants. `Agent Modified` waits for §58's confirmation experiments, where "what does the
user need to see when an agent touched their work" is the actual subject.

**Confidence**

High that the variant should not be faked. Low on what the eventual answer is.

**Revisit when**

§58 / Slice 22 runs the agent-confirmation experiments. If they conclude that attribution
belongs at the point of change, the `Task` contract grows a field, the row grows a variant,
and this entry becomes its history.
