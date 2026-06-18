# 🍒 CherryLive Puzzle
A live-camera jigsaw puzzle game — your face (or any photo) gets sliced into puzzle pieces in real time. Play solo or with friends in multiplayer over LAN. 100% free, no API keys, no accounts, no hidden costs.
---

## ✨ Features

- 📷 **Live camera puzzles** — your webcam feed becomes the puzzle image
- 📁 **Upload your own image** as an alternative source
- 🧩 **Real jigsaw tab shapes** — proper interlocking pieces, not plain squares
- 🎯 **5 difficulty levels** — 3×3 up to 8×8 (9 to 64 pieces)
- 👻 **Ghost preview** — toggle a faint outline of the full image
- 🌐 **Multiplayer (LAN)** — Competitive, Cooperative, and Race modes for up to 4 players
- 💬 **Live chat + emoji reactions** during multiplayer matches
- 🏆 **Real-time scoreboard**
- 🎊 **Confetti celebration** on completion
- 🌸 **Animated cherry blossom menu background**
- ⏱️ **Flexible timer** — count up, countdown, or off
- 💾 **Save your completed puzzle** as an image

---

## 📁 Project Structure

```
CherryLive-Puzzle/
│
├── package.json        # Node.js project config & dependencies
├── server.js           # Express + Socket.IO backend (multiplayer logic)
├── README.md
├── .gitignore
│
└── public/             # Everything served to the browser
    ├── index.html       # App layout (menu, setup, lobby, game, win screens)
    ├── style.css         # Dark cherry-blossom theme styling
    ├── app.js            # Main app controller / screen logic
    ├── puzzle.js         # Puzzle engine (piece generation, drag/drop, snapping)
    ├── network.js        # Socket.IO client wrapper for multiplayer
    ├── particles.js      # Animated background particles
    └── assets/           # Reserved for future images/icons
```

---

## 🛠️ Requirements

- [Node.js](https://nodejs.org) (LTS version) — free, one-time install
- A webcam (optional — you can also upload an image instead)
- A modern browser (Chrome, Edge, or Firefox recommended)

No API keys. No cloud services. No payment of any kind, ever.

---

## 🚀 Setup & Run

```bash
# 1. Open a terminal inside the CherryLive-Puzzle folder

# 2. Install dependencies (only express + socket.io)
npm install

# 3. Start the server
node server.js
```

You'll see:

```
🍒 CherryLive Puzzle Server running!
   Local:   http://localhost:3000
   Network: http://192.168.x.x:3000
```

Open **http://localhost:3000** in your browser to play.

### Playing Multiplayer (same WiFi)
1. Start the server as above.
2. Note the **Network** address shown in the terminal (e.g. `http://192.168.1.42:3000`).
3. Friends on the same WiFi open that exact address in their browser.
4. One person clicks **Create Room** and shares the 6-letter room code.
5. Others click **Join Room** and enter that code.
6. Host clicks **Start Game** once everyone is in the lobby.

---

## 🧰 Tech Stack
| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Real-time sync | Socket.IO |
| Frontend | Vanilla JavaScript, HTML5 Canvas, CSS3 |
| Camera | Browser `getUserMedia` API |

No frameworks, no build step, no bundler — just open and run.

---

## 📜 License
MIT — free to use, modify, and share.