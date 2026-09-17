# Mafia Party Game

Real-time browser Mafia prototype: one host screen plus phone players.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:10000

## Deploy on Render

Create a Web Service, connect this project/repository, build command `npm install`, start command `npm start`, and choose the Free plan. The server binds to `PORT` and supports WebSockets at `/ws`.

## Current prototype

- Host room creation
- Player join by code or QR-style room URL
- Lobby
- Secret role assignment
- Mafia / Doctor / Detective night actions
- Dawn/death and wills
- Discussion
- Nomination and trial
- Guilty/Innocent voting
- Town/Mafia win conditions

This is the first playable build. Production hardening still recommended: reconnect/resume, authoritative timers, stronger QR generation, duplicate-name handling, anti-cheat protections, richer narration/audio, and persistence for active rooms.
