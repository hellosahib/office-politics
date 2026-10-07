# OFFICE POLITICS
## Final Game Design Specification v1.0

### 1. Game Definition

**Genre:** Digital strategic negotiation / influence / social deduction / area-control game

**Players:** 3–4

**Characters:** 28 fixed employees

**Departments:** 7 departments, 4 employees each

**Player role:** Every player is an outside hire entering the company as a Team Lead. The player is **not one of the 28 employees**.

**Player objective:** Build the strongest political organization, capture departments, survive internal rebellion, exploit hidden information, and ultimately become CEO.

The central gameplay loop is:

> **Observe → Choose Event Response → Manage or Expand → Influence → Negotiate → React to Loyalty/Rebellion → Expand Again**

The game's defining mechanic is that employees are not simple tokens. Each employee has a personality profile, hidden traits, loyalty state, and temporary political conditions such as being a Rebel or Mole.

---

# 2. Core Design Principles

The game should always create four questions in the player's mind:

> **Who should I win over?**
> **Who is about to turn against me?**
> **Who is secretly working for another player?**
> **Can I afford to control everything I currently own?**

The game should reward: Reading personalities, Managing risk, Political negotiation, Timing, Information gathering, Long-term planning.

Randomness should create uncertainty, but never make the player feel that the game randomly decided the outcome for no reason.

There is **no AI/ML decision engine**. The game uses a deterministic variable-based Rules Engine combined with controlled randomness.

---

# 3. Board Structure

The board contains **7 departments**. Each department contains **4 employees**. Total: **7 × 4 = 28 employees**.

The board should use a **hexagonal 1+6 structure**.

```text
                  [ D1 ]

             [ D2 ]   [ D3 ]

         [ D4 ]   [ D7 ]   [ D5 ]

                  [ D6 ]
```

`D7` is the central department. `D1–D6` surround it.

Each outer department is adjacent to:
1. The central department.
2. Two neighboring outer departments.

The board's geography matters because Rebel inclination and Rebel settlement use adjacent departments.

---

# 4. Departments

| Department | Employees |
|---|---:|
| Engineering | 4 |
| Product | 4 |
| Sales | 4 |
| Marketing | 4 |
| Finance | 4 |
| Operations | 4 |
| People & HR | 4 |

Department identities are primarily thematic. Their employees are what determine the political situation.

---

# 5. Player Setup

### 3-player game
7 departments exist. 3 departments are randomly assigned as starting departments. 4 departments begin Neutral.
CEO threshold: **5 controlled departments**
Ranks: Team Lead → Manager → VP → CEO

### 4-player game
7 departments exist. 4 departments are randomly assigned as starting departments. 3 departments begin Neutral.
CEO threshold: **6 controlled departments**
Ranks: Team Lead → Manager → AVP → VP → CEO

Starting departments are assigned randomly without replacement.

Each player begins with: **1 department**, **4 employees**, **Team Lead rank**, **4 Influence**, **4 newly drawn Influence cards**

All 28 employees begin at: **Neutral — 0**

The existing department leader is an NPC role, not one of the 28 playable employee characters.

---

# 6. Player Identity

The player character represents an external corporate hire. The player does not occupy one of the employee slots.

> "You entered the company from outside. You have no built-in loyalty network. Your goal is to climb the corporate ladder and become CEO."

When the player captures a department, the current department Team Lead resigns. The player becomes the Team Lead of that department.

If that previous player no longer controls any department, that player is eliminated. There is **no comeback system**.

---

# 7. Influence — The Only Core Resource

The game has exactly one main resource: **Influence**. There is no second currency.

Influence is refreshed at the beginning of the player's turn according to rank.

| Rank | Influence |
|---|---:|
| Team Lead | 4 |
| Manager | 5 |
| AVP | 6 |
| VP | 7 |
| CEO | Game ends immediately |

For 3-player games, the AVP rank is skipped. Therefore:

### 3 players
Team Lead = 4, Manager = 5, VP = 6

### 4 players
Team Lead = 4, Manager = 5, AVP = 6, VP = 7

Unused Influence does not automatically carry over.

---

# 8. Management Cost

Controlling more departments makes the organization harder to maintain. Management cost comes from the same Influence pool used for Influence cards.

| Controlled Departments | Management Cost |
|---:|---:|
| 1 | 0 |
| 2 | 1 |
| 3 | 2 |
| 4 | 3 |
| 5 | 4 |
| 6 | 5 |

> **More departments give more political power, but consume more Influence just to keep the organization stable.**

---

# 9. Management Failure

Management cost is checked after the Event phase and before Influence actions. The player must pay as much of the management cost as possible.

If the player cannot fully pay: **Internal Instability is triggered.**

The game randomly selects one of the player's controlled departments. Two employees in that department are then randomly selected. Each selected employee moves **one step downward** on the Loyalty ladder.

If an employee is already Rebel, that employee cannot move lower and another non-Rebel employee is selected where possible.

A management failure can therefore create additional Rebels and potentially cause a leadership crisis. The management penalty is never skipped simply because the player wants to save Influence for political actions.

---

# 10. Loyalty State Machine

Each employee has one public Loyalty state.

```text
LOYAL        +4
FAVORABLE    +2 / +1
NEUTRAL       0
SKEPTICAL    -1 / -2
REBEL        -4
```

The state sequence is: **Loyal → Favorable → Neutral → Skeptical → Rebel**

Positive influence moves employees upward. Negative influence moves employees downward. No employee can move beyond Loyal or Rebel.

---

# 11. Loyalty Rules

### Loyal
The employee is strongly aligned with the current player. A hostile action against a Loyal employee requires a minimum effective spend of **2 Influence** instead of the normal minimum of 1. This represents loyalty resistance.

### Favorable
The employee supports the player but is still persuadable.

### Neutral
The employee has no meaningful political alignment. A successful positive Influence attempt by a player can establish that player as the employee's political side.

### Skeptical
The employee no longer trusts their current leadership. Another player can potentially win them over.

### Rebel
The employee is openly against the current Team Lead. A Rebel is not automatically loyal to another player.

---

# 12. Employee Allegiance

Every employee has a current political alignment: **Player A / Player B / Player C / Player D / Neutral / Rebel**

An employee is counted as belonging to a player's political side when they are: **Favorable or Loyal toward that player.**

Neutral and Skeptical employees do not count toward department ownership.

A Rival cannot simply claim a Loyal employee. They first have to move the employee downward. Once an employee reaches Neutral, another player can successfully win them.

---

# 13. Competing for the Same Employee

Multiple players may compete for the same employee. An employee can be targeted by several different players during the same round.

However: **The same player cannot target the same employee more than once during that player's turn.**

---

# 14. Rebel Creation

### A. Event-created Rebel
An Event causes the employee to become a Rebel. Their Rebel inclination is automatically assigned toward:
1. The smallest adjacent team lead, if an adjacent lead exists.
2. If no adjacent lead exists, the smallest active team lead anywhere on the board.
3. Ties are resolved randomly.

### B. Influence-created Rebel
A player pushes an employee from Skeptical into Rebel. The Rebel develops a hidden political inclination. The engine records which players contributed hostile Influence to that employee.

The Rebel inclination goes toward: **The player who contributed the most hostile Influence to that employee during the current loyalty conflict.**

If tied: The player who performed the final Rebel-triggering action wins the inclination.

The inclination remains hidden from other players.

---

# 15. Rebels Are Independent From Player Loyalty

A Rebel is "an employee who has turned against the current leadership", not "Player B's employee". A Rebel can later develop an inclination toward a player, but does not instantly become their Loyalist.

---

# 16. Rebel Conversion

A Rebel can be converted back. The minimum cost is **2 Influence**. No normal one-point positive action can immediately overcome Rebel status.

A successful Rebel conversion changes Rebel → Skeptical and assigns the converting player as the employee's new political side. Further Influence is then required to move them toward Neutral and Favorable.

---

# 17. Department Rebel Thresholds

### 0 Rebels — Normal.
### 1 Rebel — No additional department modifier.
### 2 Rebels — The department becomes **Unstable**. It receives **+1 Negative Event Modifier**: any Event whose effect targets this department is worsened by one level where applicable.
### 3 Rebels — **Leadership Crisis**. The current Team Lead is immediately downsized. If the player owns other departments, they remain in the game. If this was their final department, they are eliminated.
### 4 Rebels — **Full Rebellion**. The Rebel Settlement process begins.

---

# 18. Rebel Settlement

When all four employees in a department become Rebels:

### Step 1 — Check Rebel inclination
If at least **3 of the 4 Rebels** have the same player as their political inclination: That player becomes the new Team Lead.

### Step 2 — If there is no majority
Choose an adjacent active Team Lead. If several qualify: choose the smallest organization. If still tied: random. If there is no valid adjacent Team Lead: the department remains Neutral.

### Step 3 — Reset political states
Once a new Team Lead is selected: Employees inclined toward the new Team Lead: **Rebel → Loyal**. All other employees in that department: **Rebel → Neutral**. The old Rebel inclination metadata is cleared.

If no new Team Lead is selected, Rebel status and inclination remain intact.

---

# 19. Neutral Departments

A Neutral department has no Team Lead. Its four employees continue operating independently. A Neutral department can contain employees politically inclined toward different players.

A player becomes its Team Lead when: **3 of 4 employees are Favorable or Loyal toward that player.**

---

# 20. Capturing a Department

A department changes ownership when one player reaches **3 of 4 employees aligned to them** (Favorable or Loyal).

The moment this happens:
1. The player captures the department.
2. The current NPC/Player Team Lead resigns.
3. The capturing player becomes Team Lead.
4. The player's controlled-department count increases.
5. A Promotion Point is gained.
6. Rank is re-evaluated.
7. Management cost increases accordingly.
8. CEO victory condition is checked.

---

# 21. Promotion System

Every captured department grants **1 Promotion Point**. Rank progression is based on the number of departments controlled.

### 3-player game
| Controlled Departments | Rank |
|---:|---|
| 1 | Team Lead |
| 2 | Manager |
| 3–4 | VP |
| 5 | CEO |

### 4-player game
| Controlled Departments | Rank |
|---:|---|
| 1 | Team Lead |
| 2 | Manager |
| 3 | AVP |
| 4–5 | VP |
| 6 | CEO |

Promotion increases Influence capacity.

---

# 22. CEO Victory — Takeover Mode

The game immediately ends when a player controls **N + 2 departments** (3 players → 5, 4 players → 6). The player becomes **CEO** and wins immediately. The CEO threshold is checked after every department ownership change.

---

# 23. Election Mode

In Election Mode, there is no immediate CEO victory. Players choose **8, 10, 12 or 15 rounds** before the game begins. The game ends when the chosen number of rounds is complete.

At the end all players reveal: Controlled departments, Loyalists, Favorable employees, Rebels, Active Moles, Exposed Moles, Secret Agenda, relevant hidden information.

The player with the highest score becomes **CEO**.

---

# 24. Election Scoring

| Achievement | Points |
|---|---:|
| Controlled Department | +10 |
| Loyal employee | +2 |
| Favorable employee | +1 |
| Rebel | -2 |
| Mole planted during the game (each) | +3 |  *(changed from "Active Mole at game end" by owner on 2026-10-07)*
| Secret Agenda completed | +8 |

An exposed/expired Mole gives no end-of-game Mole points.

### Tie breakers
1. Most controlled departments. 2. Most Loyal employees. 3. Fewest Rebels. 4. Most completed Secret Agenda conditions.

---

# 25. Secret Agendas

Each player receives one unique Secret Agenda in Election Mode.

| Agenda | Objective |
|---|---|
| The Empire Builder | Control 4+ departments |
| The Stabilizer | Finish with no department containing more than 1 Rebel |
| The Puppet Master | Have 2+ active Moles during the game |
| The Opportunist | Capture a previously Neutral department |
| The Saboteur | Create 5 Rebels |
| The People Manager | Finish with the most Loyalists |
| The Survivor | Never lose your starting department |
| The Climber | Reach VP before the final round |
| The Information Broker | Privately acquire 4 revealed-trait cards |
| The Corporate Fixer | Successfully resolve 3 negative Events without triggering Internal Instability |

Only one player can receive each agenda during a match.

---

# 26. Trait System

There are **5 trait dimensions**, each with two opposing personality poles.

| Trait Dimension | Positive Pole | Adverse Pole |
|---|---|---|
| Drive | Ambitious | Lazy |
| Loyalty | Loyal | Disloyal |
| Social | Gossip | Private |
| Recognition | Credit-hungry | By-the-book |
| Risk | Risk-taking | Cautious |

Each employee has **3 active traits**. One is permanent. Two change every game.

---

# 27. Character Trait Weighting

### Permanent Trait — Always known. Weight **+1**
### Hidden Trait #1 — Randomized at the beginning of every match. Weight **+2**
### Hidden Trait #2 — Randomized at the beginning of every match. Weight **0**

The hidden traits are selected from the four remaining trait dimensions. The complementary trait of a character's existing dimension is not also assigned.

Example: Arjun — Known: Ambitious +1; Hidden: Credit-hungry +2, Cautious 0. Next game: Ambitious +1, Gossip +2, Disloyal 0.

---

# 28. Trait Interaction

Cards do not have fixed loyalty outcomes. Cards have personality affinities. A card typically contains: Primary positive trait, Secondary positive trait, Adverse trait.

Example — Public Praise: Primary Credit-hungry, Secondary Ambitious, Adverse By-the-book.

If the target has Credit-hungry +2 → the card receives +2. Ambitious +1 → +1. By-the-book +2 → -2. If the relevant trait has weight 0 → 0.

> **Know the employee → remember or discover traits → select the appropriate card.**

---

# 29. Trait Reveal

Only the permanent trait is initially visible. Hidden traits are revealed through Event cards.

When a hidden trait is revealed, the player who receives the information gets two choices:

### Public Reveal — Cost 0 Influence. The trait is immediately shown to everyone.
### Private Reveal — Cost 1 Influence. The trait remains secret. The Reveal card is placed into the player's 3-slot private Reserve. The trait is stored in the player's private Intel Log.

Private Reveal cards cannot be traded. The owner may publicly expose the information later.

---

# 30. Influence Card System

Each player draws 4 Influence cards at the start of their action phase. They may play multiple cards as long as they can pay the total costs. All cards are single use.

Every card contains: Card name, Cost, Base Effect, Mode, Trait affinities, Possible secondary effect, Possible failure/backfire.

---

# 31. Influence Card Modes

### Internal — Usable during Management.
### External — Usable during Expansion.
### Both — Usable in either mode.

---

# 32. Turn Focus

Every turn the player chooses one: **MANAGE** or **EXPAND**.

### Manage — The player targets employees inside their own departments. Purpose: Repair loyalty, Prevent rebellion, Strengthen loyalists, Resolve internal problems, Prepare for Events.
### Expand — The player targets employees in Neutral departments or other players' departments. Purpose: Recruit, Destabilize, Create Rebels, Break rival loyalty, Capture departments.

---

# 33. Influence Card Costs

| Card Strength | Typical Cost |
|---|---:|
| Small | 1 |
| Standard | 2 |
| Strong | 3 |
| Major | 4 |
| Mole | 3 |

A player cannot play a card if its required cost exceeds available Influence.

---

# 34. Saving Cards

At the end of the turn, unused newly drawn cards are discarded unless saved. A player can save a card by paying **1 Influence per card**. Maximum **3 saved cards** (Reserve size 3).

Saved Influence cards may be traded between players. Freshly drawn, unsaved cards cannot be traded.

---

# 35. Recommended Influence Resolution Formula

```text
Action Score = Card Base Effect + Rank Bonus + Trait Modifiers + Event Modifiers + Random Modifier
```

### Rank Bonus
| Rank | Bonus |
|---|---:|
| Team Lead | 0 |
| Manager | +1 |
| AVP | +2 |
| VP | +3 |

### Random Modifier
-1 / 0 / +1, weighted toward 0: -1 = 20%, 0 = 60%, +1 = 20%.

---

# 36. Influence Resolution Bands

### Score 0–1 — Failure. No loyalty movement. The card may have a specific failure consequence.
### Score 2–3 — Standard Success. Target moves **1 Loyalty state** in the intended direction.
### Score 4+ — Strong Success. Target moves **1 Loyalty state** and the card's secondary effect triggers.

The normal system never moves a character more than one Loyalty state with one card. Special cards may explicitly override this.

---

# 37. Hostile Influence Resistance

For a negative/hostile card: normal minimum effective spend **1 Influence**. Against a Loyal employee: **2 Influence minimum**. The player must pay whichever is higher: Card Cost or Loyalty Resistance.

---

# 38. Successful Rebellion Through Influence

If a negative action successfully moves a Skeptical employee further downward (Skeptical → Rebel), the Rebel inclination is assigned according to the Influence contribution rules. The employee immediately counts toward the department's Rebel total. The appropriate department crisis threshold is then checked.

---

# 39. Example Influence Cards

The full game should start with approximately **72 Influence cards**. A good first content set is based on these 20 normal templates.

| Card | Cost | Primary Affinity | Adverse Affinity |
|---|---:|---|---|
| Lunch Invite | 1 | Gossip | Private |
| One-on-One Conversation | 1 | Private | Gossip |
| Ask for a Favor | 1 | Loyal | Disloyal |
| Flexible Work Arrangement | 1 | Lazy | By-the-book |
| Public Praise | 2 | Credit-hungry | By-the-book |
| Give Credit | 2 | Credit-hungry | Ambitious |
| Cover Their Mistake | 2 | Loyal | By-the-book |
| Defend Them in Public | 2 | Loyal | Private |
| Exclusive Information | 2 | Gossip | Private |
| Take Credit for Their Work | 2 | Ambitious | Credit-hungry |
| Withhold Recognition | 2 | Credit-hungry | Ambitious |
| Block Promotion | 3 | Ambitious | Lazy |
| Promise Promotion | 3 | Ambitious | Lazy |
| Executive Meeting Invite | 3 | Ambitious | Private |
| High-Visibility Project | 3 | Risk-taking | Cautious |
| Give Decision Ownership | 3 | Risk-taking | By-the-book |
| Assign Unwanted Task | 1 | Lazy | Loyal |
| Leak a Rumor | 2 | Gossip | Private |
| Escalate to HR | 3 | Risk-taking | By-the-book |
| Remove From Spotlight | 2 | Credit-hungry | Ambitious |

The exact affinity matrix is stored in the card data, not hard-coded into UI text.

---

# 40. Mole Cards

Recommended full deck: **6 × Silent Block Mole**, **6 × Rebel Pressure Mole**. Total **12 Mole cards**.

### Mole: Silent Block — Cost 3. Plant a Mole on a non-Loyal employee. Secret ability: Secretly block one positive Influence attempt against that employee.
### Mole: Rebel Pressure — Cost 3. Plant a Mole on a non-Loyal employee. Secret ability: During a team crisis, secretly add +1 Rebel Pressure.

Each Mole ability can be used **once** during its active lifetime.

---

# 41. Mole Rules

A Mole cannot target a Loyal employee. A Mole has a hidden creator; only the creator knows the Mole exists. A Mole does not transfer to another player.

A Mole remains active for **2 full rounds after placement**. Example: planted Round 3 → active Round 4, Round 5 → expires start of Round 6.

---

# 42. Mole Loyalty Lock

While a Mole is active, positive loyalty movement is blocked. The character may remain at its current state or move downward. It cannot move upward. This is called **Loyalty Lock**.

A Mole can be placed on Neutral, Skeptical, Favorable or Rebel employees. Not on Loyal.

---

# 43. Mole and Rebel Interaction

If the Mole's secret ability is used to add Rebel Pressure during a crisis, the engine treats the Mole as **+1 temporary Rebel Pressure**. It does not permanently add another Rebel. If the additional pressure crosses a crisis threshold, that crisis resolves immediately. This allows 2 Rebels + Mole Pressure to trigger a leadership crisis. The employee itself does not permanently become a third Rebel.

---

# 44. Mole Discovery

When a Mole is revealed, the Team Lead gets a public accusation interface and must guess: **Who planted this Mole?** The accusation is public.

### Correct accusation — The creator is revealed. The Mole remains in its current loyalty state and expires normally.
### Wrong accusation — The creator remains hidden. The Mole becomes Skeptical (unless already Rebel). The Mole then expires normally.

---

# 45. Event Deck

An Event happens **at the beginning of every active player's turn.** The Event can be **Global**, **Local** or **Reveal**.

---

# 46. Global Event

A Global Event affects all players. Players receive a short simultaneous decision window and choose between the available political responses. The Event resolves according to its rule, normally by **majority vote**. Negotiation is allowed before everyone locks their decision.

---

# 47. Local Event

A Local Event affects **only the active player** and a department is selected **randomly from the active player's controlled departments.** If the department has 2+ Rebels, its Instability Modifier applies.

Local Events should present: two bad choices, or one good option with a delayed cost, or one immediate benefit that creates future political damage.

---

# 48. Reveal Events

Reveal Events select an eligible employee. The active player receives the employee's hidden trait information and can reveal publicly for 0 Influence or pay 1 Influence and keep it private. If the employee has already had both hidden traits revealed, the Event targets another eligible employee.

---

# 49. Event Deck Size

Full version target: **56 Event cards**: Global 24, Local 24, Reveal 8. Cards can have multiple copies.

---

# 50. Global Event Examples

### Promotion Season
Each player chooses **Honor Commitments** or **Open Competition**.
Honor Commitments: Promote one previously promised employee. Every other employee in the same department who had an active promotion promise moves down one Loyalty state.
Open Competition: Choose any eligible employee in your organization to receive the promotion. If promises existed in that department and none are fulfilled, the promised employees suffer the Event's resentment penalty.

### Budget Freeze
Choose **Protect** or **Cut**.
Protect: Choose one department that cannot receive a negative Event effect this cycle.
Cut: Choose one department to accept a negative effect and receive a temporary political advantage from the cost savings.

### CEO Town Hall
Every player chooses **Support the CEO** or **Challenge the Strategy**. The majority determines the company-wide policy. The minority receives a small political upside but must accept an internal cost.

### Company Audit
**Full Transparency** or **Protect My Team**. Transparency exposes one hidden issue. Protecting the team suppresses the issue temporarily but increases future Event severity.

### Cross-Department Project
Vote **Collaborate** or **Compete**. Collaboration reduces Event pressure but can strengthen a rival department. Competition creates a short-term Influence opportunity but increases Rebel risk.

---

# 51. Local Event Examples

### Missed Deadline — **Protect Employee** or **Blame Employee**. Protect: Employee remains stable but another random employee in the department loses 1 state. Blame: Target loses 1 state immediately.
### Promotion Promise Review — Check the department for active promises. One promise can be honored. Unfulfilled promises cause loyalty loss. If there was no promise: a random ambitious or credit-hungry employee suffers a resentment drop.
### Client Complaint — **Back Your Team** or **Sacrifice One Employee**. Backing the team protects one employee but increases department pressure. Sacrificing an employee reduces event pressure but lowers their loyalty.
### Surprise Resignation — A random employee becomes temporarily unavailable. **Redistribute their responsibilities** or **Give someone a promotion**. Each has different loyalty consequences.
### Credit Dispute — Two employees compete over recognition. The Team Lead chooses one. The selected employee moves up. The other moves down.
### Team Burnout — **Push Through** (small immediate advantage, higher risk of Rebel creation) or **Protect The Team** (no short-term advantage but prevents an additional loyalty drop).

---

# 52. Event Chain System

Events are allowed to create temporary state flags. The most important initial flag is **Promotion Promise**. A Promise Promotion Influence card creates a promise. The promise remains active for **3 rounds** or until resolved.

When Promotion Season occurs: a promised employee can be promoted; other promised employees may lose loyalty; if the player ignores all promises, the Event generates resentment.

---

# 53. Turn Sequence

## Phase 1 — Event: Reveal one Event card. Resolve Global, Local or Reveal rules.
## Phase 2 — Refresh Influence: Set the player's Influence to their current rank maximum.
## Phase 3 — Management Cost: Calculate and pay. If unable: trigger Internal Instability.
## Phase 4 — Draw Influence Cards: Draw 4 cards into the temporary hand.
## Phase 5 — Negotiation: Players may openly negotiate: make promises, form/break alliances, trade eligible saved cards, share information, threaten, bluff. Nothing is mechanically binding unless a card explicitly creates a game-state commitment.
## Phase 6 — Choose Turn Focus: MANAGE or EXPAND.
## Phase 7 — Play Influence Cards: Any number of legal cards as long as affordable. Same employee: maximum one target by that player this turn.
## Phase 8 — Resolve Political Changes: Loyalty movement, Rebel creation, Mole effects, Promises, Department capture, Leadership crises, Promotion changes.
## Phase 9 — Save Cards: 1 Influence per card into Reserve (max 3). Remaining temporary cards discarded.
## Phase 10 — End Turn: UI summarizes what changed. Turn passes to the next active player.

---

# 54. Round Structure

A round consists of every non-eliminated player taking one complete turn. The first-player marker rotates after every round. A round counter is displayed in Election Mode.

---

# 55. Negotiation Rules

Negotiation is unrestricted and public. Players may make non-binding deals, form temporary alliances, trade eligible saved cards, share or hide information, coordinate, betray. The game does not automatically punish broken promises unless a card/event has created a formal Promise state.

---

# 56. Public Information

Department ownership, Employee identities, Permanent traits, Publicly revealed hidden traits, Employee Loyalty states, Who is a Rebel, Department Rebel counts, Global Events, Public accusations, Rank, Department count, Public trade proposals.

# 57. Private Information

Unrevealed traits, Privately acquired trait information, Secret Agenda, Mole creator, Mole ability, Mole target, Mole expiry, Private Intel Log. The existence of a secret Mole is not shown to other players.

---

# 58. UI — Main Board

Each department tile displays: Department name, Current Team Lead / Neutral, 4 employee portraits, each employee's Loyalty state, current political alignment, Rebel indicator, Rebel count, Instability status, Mole indicator only to the Mole owner. Departments owned by the current player must be visually distinguishable.

# 59. UI — Employee Card

Clicking an employee opens: Name, Role, Department, Permanent trait, Hidden Trait 1, Hidden Trait 2, Current Loyalty state, Loyalty score, Political side, Rebel inclination if known, Promise status, Mole status if privately known, Recent public actions.

Trait display: **Trait Name + Modifier**, e.g. Ambitious **(+1)**, Credit-hungry **(+2)**, Cautious **(0)**. Hidden traits appear as `???` until revealed.

# 60. UI — Influence Hand

Card name, Cost, Base Effect, Mode, Trait affinity, Potential secondary effect, Potential backfire, Play button, Save button. The system should show a predicted outcome before play:

```text
Public Praise — Cost: 2
Base: 1, Ambitious: +1, Credit-hungry: +2, By-the-book: -1, Rank: +1, Random: -1 to +1
Known outcome range: 3–5
```

Hidden traits that the player does not know should not be exposed. If an unknown trait could change the outcome, display: **Unknown trait may affect result**

# 61. UI — Event Resolution

Event title, Situation, Target, Available choices, Political consequence, Time to respond. Global Events additionally show: Current vote, Player decisions, Negotiation status. Choices remain hidden from other players until all decisions are locked when the Event requires secret voting.

# 62. UI — Global Event Voting

All players receive Option A / Option B. Each player locks a choice. After everyone locks, votes are revealed. The majority choice wins unless the Event has a special tie rule.

# 63. UI — Mole Experience

For the Mole creator, the target employee displays a private **MOLE ACTIVE** panel: Mole type, Ability, Turns remaining, Ability used / unused. Other players see none of this. When triggered, the creator receives **Mole triggered successfully**. The victim player simply receives the normal action result.

# 64. UI — Accusation

When a Mole is exposed, a public modal asks the Team Lead **Who planted this Mole?** with the active players as choices. Correct → **Accusation Correct**, creator revealed. Wrong → **Accusation Incorrect**, creator remains secret, Mole downgraded to Skeptical unless already Rebel, then expires.

# 65. UI — Player Dashboard

Rank, Current/Maximum Influence, Controlled departments, Management Cost, Saved Cards / 3, Loyalists, Favorable employees, Rebels, Active Moles, Secret Agenda (private), Round number, Turn status.

# 66. UI — Political Log

A permanent log records public game history. Private events appear separately in the relevant player's log.

# 67. UI — End Turn Summary

Influence spent, Cards played, Cards saved, Employees changed, New Rebels, Departments captured/lost, Management penalty, Promises created/resolved, Mole activity, Promotion. The player confirms **End Turn**.

# 68. UI — End Game

Takeover: **PLAYER X IS CEO** then departments, loyalists, rebels, moles, influence efficiency, political highlights.
Election: scoring table per player (Departments, Loyalists, Favorable, Rebels, Active Moles, Secret Agenda, Total). Highest score becomes CEO.

---

# 69–72. Rules Engine Data (Employee, Department, Player, Game)

Employee: id, departmentId, name, role, permanentTrait(+1), hiddenTrait1(+2, revealed?), hiddenTrait2(0, revealed?), loyaltyScore, loyaltyState, politicalOwner, rebelInclination, rebelSource, promotionPromise, moleActive, moleCreator, moleAbility, moleExpiresRound, moleAbilityUsed.

Department: id, name, employeeIds[4], teamLeadPlayerId, neutral, rebelCount, instabilityLevel (0 normal, 1 unstable, 2 leadership crisis, 3 full rebellion), adjacency[].

Player: id, rank, promotionPoints, influenceMax, influenceCurrent, controlledDepartmentIds, temporaryHand[], reserveCards[] (max 3), secretAgenda, score, eliminated, publicStats.

Game: playerCount, mode, round, currentPlayer, firstPlayerMarker, board, employees[28], departments[7], players, influenceDeck, eventDeck, agendaDeck, activeEvent, randomSeed, publicLog.

Use a seeded random engine so every match is reproducible for testing, bug investigation, balance simulation, replay analysis.

# 73. Rules Engine — Influence Resolution

1. Validate card 2. Validate target 3. Validate mode 4. Calculate minimum Influence requirement 5. Deduct cost 6. Read target traits 7. Calculate trait modifiers 8. Add rank modifier 9. Add Event modifiers 10. Apply Mole effects 11. Generate controlled random value 12. Calculate final Action Score 13. Resolve success band 14. Move Loyalty state if required 15. Check Rebel threshold 16. Check department capture 17. Check promotion 18. Check CEO condition 19. Write public/private log entries

# 74–75. No AI; Character memory is explicit variables (Loyalty, Political owner, Promise, Rebel inclination, Mole status, Event consequences).

---

# 76. Full Character Roster

## ENGINEERING
| Character | Role | Permanent Trait | Visual Identity |
|---|---|---|---|
| Sahib Singh (was Arjun Mehta) | Senior Backend Engineer | Ambitious | Always carrying a mechanical keyboard case and achievement stickers |
| Riya Shah | Mobile Engineer | Loyal | Organized laptop setup and team-branded notebook |
| Kabir Anand | QA Engineer | By-the-book | Checklist pad and meticulous workspace |
| Mehul Sethi | DevOps Engineer | Risk-taking | Hoodie, multiple monitors, constantly experimenting |

## PRODUCT
| Neha Kapoor | Product Manager | Gossip | Tablet full of notes and constantly changing chat bubbles |
| Vikram Rao | UX Researcher | Loyal | Interview notebook and headphones |
| Tanya Jain (was Tara Bansal) | Product Designer | Credit-hungry | Sketchbook and presentation clicker |
| Yash Malhotra | Business Analyst | Ambitious | Formal notebook and KPI dashboard |

## SALES
| Sameer Khanna | Account Executive | Credit-hungry | Phone headset and polished presentation deck |
| Pooja Nair | Enterprise Sales | Ambitious | Premium notebook and confident posture |
| Rohit Bedi | Sales Operations | By-the-book | Spreadsheet-heavy laptop and rule checklist |
| Simran Arora | Business Development | Gossip | Phone, coffee and constant message notifications |

## MARKETING
| Aisha Khan | Brand Manager | Risk-taking | Camera and campaign mood-board |
| Dev Oberoi | Growth Marketer | Ambitious | Analytics dashboard and smartwatch |
| Nitin Jain | Content Strategist | Loyal | Notebook and long-form writing setup |
| Isha Verma | Social Media Lead | Gossip | Smartphone tripod and social-feed interface |

## FINANCE
| Kunal Gupta | Finance Manager | By-the-book | Calculator, spreadsheet and formal folder |
| Nandini Jain (was Meera Joshi) | FP&A Analyst | Loyal | Organized reports and coffee mug |
| Aditya Sen | Procurement Specialist | Cautious | Comparison sheets and vendor folders |
| Lavanya Iyer | Financial Controller | Ambitious | Formal attire and approval dashboard |

## OPERATIONS
| Manav Kapoor | Operations Manager | Loyal | Operations board and company ID badge |
| Sakshi Chawla | Project Coordinator | Gossip | Planner covered in meeting notes |
| Raghav Singh | Facilities Coordinator | Lazy | Coffee cup, relaxed posture and unfinished task list |
| Ananya Bose | Supply Chain Lead | Risk-taking | Logistics dashboard and travel bag |

## PEOPLE & HR
| Farhan Ali | HR Business Partner | Private | Closed notebook and one-on-one meeting setup |
| Priya Sethi | Recruiter | Gossip | Candidate list and phone |
| Karan Gill | L&D Manager | Loyal | Training material and presentation screen |
| Mitali Das | Compensation & Benefits | By-the-book | Policy binder and structured spreadsheet |

---

# 77. Hidden Trait Generation

At match start, for each character: 1. Keep permanent trait. 2. Select two different trait dimensions from the remaining four. 3. Select one pole for each. 4. Assign one as +2. 5. Assign the second as 0. 6. Keep both hidden.

# 79. Department Takeover Example
Product is Neutral: Neha → A Favorable, Vikram → Neutral, Tara → A Loyal, Yash → B Favorable. A influences Vikram Neutral → Favorable. A = 3/4 → A captures Product immediately, gets a Promotion Point, management cost increases, CEO check.

# 80. Internal Instability Example
B controls 3 departments, cost 2, has 1 Influence. Engine randomly selects Operations, two non-Rebel employees each lose a state. One was Skeptical → Rebel. Operations now has 2 Rebels → Unstable.

# 81. Mole Example
A plays Mole: Silent Block on Simran (Favorable, in B's Sales). For 2 rounds Simran cannot gain Loyalty. B plays Public Praise → the Mole blocks it. B sees "Public Praise failed." A sees "Mole triggered." Later an Investigation Event exposes Simran; B accuses publicly.

---

# 82–83. Mini Prototype
3 players, 4 departments (A/B/C/D adjacent hexes), 16 employees, 1 Neutral, 6-round sandbox, Influence 4/5/6, normal management table, Event deck 18 (8 Global, 7 Local, 3 Reveal), Influence deck 24 (18 normal, 6 Mole), Secret Agenda disabled, CEO victory disabled.

# 84–85. Full Version
3–4 players, 7 departments, 28 employees, 1 central + 6 surrounding hexes, Influence deck 72 (Social 12, Recognition 12, Support/Protection 12, Authority/Career 12, Pressure/Sabotage 12, Mole 12), Event deck 56 (Global 24, Local 24, Reveal 8), 10+ Secret Agendas, Takeover and Election modes.

# 86. Game Modes
TAKEOVER: no fixed round count; first to N+2 departments is CEO.
ELECTION: 8/10/12/15 rounds; all secrets revealed at the end; highest score is CEO.

# 88. Randomness should determine: hidden trait assignments, card draws, event draws, small Influence variance, random Event targets, random management failure targets, tie-breaks. It should NOT determine "your employee randomly betrayed you".

# 89. Character Outcome Explanation
After every Influence action the engine provides an explanation (Base, each known trait, Rank, Random, total). Only known/revealed information is displayed. If hidden information affected the result: **A hidden trait affected this decision.**

# 95. Source-of-Truth Rules (locked for v1)
7 departments; 28 fixed employees; 3–4 players; hex board; one Influence resource; management cost; Manage vs Expand; 4 cards drawn per turn; 3 saved-card max; cards cost Influence; same employee cannot be targeted twice by one player in one turn; 5 trait dimensions; one known +1 trait, one hidden +2, one hidden 0; hidden traits randomized every match; all employees start Neutral; Loyal/Favorable/Neutral/Skeptical/Rebel; 2+ Rebels = Unstable; 3 Rebels = Team Lead downsized; 4 Rebels = Rebel Settlement; Rebels are not automatically another player's employees; Rebels have hidden inclinations; Rebels cost 2 Influence to recover; Moles cannot target Loyal; Moles last 2 rounds; Moles freeze upward movement; Mole abilities are one-use; public Mole accusation; wrong accusation does not reveal creator; Global/Local/Reveal Events; Local Event targets a random owned department; Events create dilemmas and chains; open negotiation; non-binding alliances; card trading limited to saved cards; no comeback after elimination; Takeover Mode; Election Mode; Secret Agendas in Election Mode; CEO at N+2 in Takeover; highest score is CEO in Election; no AI decision engine; Rules Engine + controlled randomness; Mini Prototype before full game.

# 96. Positioning
> **A digital corporate warfare game where you don't directly defeat your opponents — you build, destabilize and politically control the people inside their organization.**
