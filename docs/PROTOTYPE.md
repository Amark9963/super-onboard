# Onboarding prototype (v2)

A front-end-only prototype of a customer-onboarding workspace for a voice-agent team. It is
independent, uses fictional data only (Oakwood Property Group and made-up people), and is not
connected to any vendor or backend. The root page of the Next.js app in `frontend/` is the
prototype; the older v1 app is still available at `/legacy`.

## Run it

```
cd frontend
npm install
npm run dev          # http://localhost:3000
# or a production build:
npm run build && npx next start -p 3100
```

Checks: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`.

## What it shows

One client onboarding from kickoff to go-live, in the structure of a delivery tool:

- **Plan:** five phases of tasks. Every task has an owner (a customer contact or our team), a status
  and a due date.
- **Documents:** upload (simulated), extraction with citations, and contradiction detection on one
  screen. It compares statements across the customer's documents and our own draft instructions.
- **Clarifications:** one question per conflict or open detail, assigned to the customer contact who
  decides that topic. Replies are evidence until a specialist approves them.
- **Requirements:** the 20 required details, each with a source, an owner, a status and an approval,
  plus the customer team's roles and routing rules.
- **Activity:** who did what, on which side (customer, our team, automatic).
- **Customer portal:** a separate view with only the customer's tasks, uploads and questions.
- **Team:** our own members, roles and a simulated invite flow. The onboarding owner is chosen from
  the team.

## Try it (about five minutes)

The app has a "Try it" guide: a bar at the bottom that shows the next step, and a list of all steps
that ticks off by itself. The same path:

1. **Sign in.** Any input works; it is simulated.
2. **Start an onboarding.** Clients → New onboarding. In the customer-team step press
   “Add team member” to fill in the fields, or “Use the sample team”.
3. **Send the document request** from Next up on the Plan.
4. **Documents tab:** drop the sample documents, press “Looks right” on each extraction, and add the
   draft instructions.
5. **Detect contradictions.** Two appear: the handbook and the kickoff call disagree about weekend
   flooding, and our own draft instructions contradict each other. Fix the draft one with a reason.
6. **Clarifications tab:** approve the wording of each question and send it. Both go to the contact
   who decides routing and integrations.
7. **Preview as customer** (or the guide's “Answer as the customer”): answer as Maya Chen.
8. **Approve the replies** and close the open gaps (waive them with a reason).
9. **Plan:** setup and go-live tasks unlock once clarification is done. Tick them off.

## What is simulated

- Sign-in, file upload, document extraction, sending questions, the customer's answers and team
  invitations are all simulated, and labelled as such on screen. Nothing leaves the browser.
- The setup and go-live tasks (configure, connect, test, launch) are a checklist. Those steps happen
  in the customer's agent platform; this prototype only tracks them.

## Layout of the code

`frontend/app/prototype/`

- `state.ts` pure state and rules (no React); `plan.ts` the derived plan; `activity.ts` the feed;
  `demo.ts` the Try it checklist. All are covered by `frontend/tests/prototype.test.mjs`.
- `prototype.tsx` the shell and routing; `workspace.tsx`, `documents.tsx`, `clarifications.tsx`,
  `requirements.tsx`, `team.tsx`, `pages.tsx` the screens; `prototype.css` the design system.
