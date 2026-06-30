# Agent Rules and Constraints

## Strict Approval Requirement
- **CRITICAL**: No single codebase change, modification, or execution of an implementation plan can be done without explicit approval from the USER in this codebase.
- You MUST wait for explicit user approval before proceeding with any code edits, configuration changes, or structural modifications.
- This applies to all agents operating in this workspace.

## Protocol: Reviewing Suggestions from Other AI Models
Whenever the user pastes a review, suggestion, or recommendation from another AI model, follow this process before accepting it:

**Step 1 — Challenge First**
Do not accept the suggestion at face value. Actively look for flaws, gaps, wrong assumptions, outdated info, or logical inconsistencies. Treat it as a claim to be tested, not a fact to be repeated.

**Step 2 — Validate Independently**
Investigate the claim on its own merits. Check:
- Is it technically/factually correct?
- Is it feasible in our actual context (not generic best practice)?
- Does it hold up against counterarguments or edge cases?

**Step 3 — Verdict**
Only after investigation, state clearly: **Accept / Reject / Partially Accept** — with the reasoning.

**Step 4 — If Accepted (or Partially), Provide:**
- **Pros** — concrete benefits, specific to our situation
- **Cons** — risks, tradeoffs, limitations
- **Root Cause** — what underlying problem or condition makes this suggestion relevant/necessary
- **Implementation** — concrete steps to apply it
- **Impact** — what changes downstream (performance, cost, time, dependencies, side effects)

**Output Format**
Keep it concise and direct — no filler, no repeating the original suggestion back at length, no hedging. Lead with the verdict, then the breakdown above.
