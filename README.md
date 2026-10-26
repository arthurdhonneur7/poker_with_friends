# ♠️ Poker With Friends

A real-time multiplayer **No-Limit Texas Hold'em (NLH)** web application designed for playing cash games with your friends using virtual chips.

---

## ✨ Features

- **Lobby & Tables**:
  - Live cash game lobby showing active and paused tables.
  - Create custom cash games with custom blinds (e.g. `1/2`, `5/10`, `50/100`) and player limits (2 to 9 players).
  - Pre-configured starter table: **Arthur's High Rollers (100 BB)**.
- **Strict 100 BB Cap & Top-Up**:
  - All buy-ins start capped at **100 Big Blinds (100 BB)** (e.g., 200 chips for `1/2` blinds).
  - Seated players can click **"Add Chips (100 BB)"** at any time to refill their stack up to 100 BB.
- **Persistent Database Games & Pausing**:
  - All tables, seated players, chip stacks, pots, and hand history persist in **PostgreSQL**.
  - All tables are prefixed with `poker_with_friends_{}`:
    - `poker_with_friends_users`
    - `poker_with_friends_games`
    - `poker_with_friends_game_players`
    - `poker_with_friends_hand_history`
  - **Pause & Resume**: Table hosts or players can pause games at any time. You can safely leave the table to the lobby and return later — the exact chip stacks and state remain intact.
- **Complete NLH Engine**:
  - Blinds posting (Small Blind, Big Blind) with proper Heads-Up and multi-way button logic.
  - Actions: Fold, Check, Call, Bet, Raise (Min, 1/2 Pot, Pot, All-In, slider), Show Cards.
  - Accurate 7-card Texas Hold'em evaluator with kicker tie-breakers and split/side pots.
- **Social Features**:
  - Real-time in-game chat and dealer action announcement feed.
  - Friends leaderboard tracking hands played, hands won, and net profit.
  - 1-click Quick Login profiles for friends: **Arthur**, **Matteo**, and **Cyprien** (passwords: `1234`).

---

## 👥 Seed Profiles

| Username | Password | Default Color |
|---|---|---|
| `arthur` | `1234` | Emerald Green |
| `matteo` | `1234` | Royal Blue |
| `cyprien` | `1234` | Amber Gold |

*Any user can also register new accounts directly from the login screen.*

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (.env)
The repository connects by default to your Render PostgreSQL database:
```env
DATABASE_URL=postgresql://real_estate_db_osz6_user:0kFF0DPxXD9fJ9q5DNJySdmUBtkWHvBS@dpg-d02b4hje5dus73bjo250-a.frankfurt-postgres.render.com/real_estate_db_osz6
JWT_SECRET=poker_with_friends_super_secret_key_2026
PORT=3001
```

### 3. Build & Run
```bash
# Build the React frontend
npm run build

# Start the full-stack server (serves frontend + Socket.IO + REST API)
npm start
```

Visit [http://localhost:3001](http://localhost:3001) in your browser.

---

## 🌐 Deployment to Render

This repository includes a `render.yaml` blueprint. To deploy on Render:

1. Push your repository to GitHub.
2. In Render, create a new **Web Service** pointing to this repository (or select **Blueprints** and pick `render.yaml`).
3. Set the build and start commands:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add the environment variable `DATABASE_URL` with your PostgreSQL connection string.

---

## 🧪 Testing

To run the Texas Hold'em evaluator tests:
```bash
npm test
```
