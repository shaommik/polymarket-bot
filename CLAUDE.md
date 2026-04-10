# Polymarket Copy-Trading Bot

## Stack
- Node.js + TypeScript backend
- React + Vite frontend dashboard
- Polymarket CLOB API + WebSocket
- Prisma + SQLite (dev) / Postgres (prod)
- pino for structured logging
- ethers.js for wallet/signing

## Rules
- NEVER execute real trades unless paper_mode is explicitly set to false in config
- Always validate wallet addresses before watching
- Risk limits are sacred, never bypass them
- Use structured logging on all trade events
- Never create more than 3 subagents without asking me first
- Ask for my approval before switching paper_mode to false

## Project Goal
A multi-bot copy trading system for Polymarket that watches 
wallet addresses and mirrors their trades, with separate PnL 
tracking per bot organized by niche (Crypto, Sports, Politics etc)
