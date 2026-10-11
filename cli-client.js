import { io } from "socket.io-client";
import readline from "readline";

const SERVER_URL = process.env.CHAT_SERVER_URL || "https://chat-server-2-fzyd.onrender.com";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

let username = "";
let room = "";

// Logs in (or registers) over HTTP and returns the token the socket handshake requires
async function authenticate() {
  const choice = (await ask("Log in or register? (l/r): ")).trim().toLowerCase();
  const mode = choice.startsWith("r") ? "register" : "login";
  const name = (await ask("Username: ")).trim();
  const password = await ask("Password: ");

  try {
    const response = await fetch(`${SERVER_URL}/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`\n ${data.error || "Authentication failed."}\n`);
      return authenticate();
    }

    username = data.user.username;
    return data.token;
  } catch (err) {
    console.error(`\n Can't reach ${SERVER_URL}: ${err.message}\n`);
    return authenticate();
  }
}

const token = await authenticate();

console.log("Connecting directly to Socket.io backend...");

// Bypasses local DNS resolution glitches by forcing standard polling-first handshakes
const socket = io(SERVER_URL, {
  transports: ["polling", "websocket"],
  forceNew: true,
  autoConnect: true,
  auth: { token }
});

socket.on("connect_error", (err) => {
  console.error("\n Handshake failed:", err.message);
});

socket.on("connect", () => {
  console.log("\n Successfully connected to chat server!");
  initSession();
});


socket.on('chat_history',(history) =>{
    if (history && history.length > 0){
        console.log(`Loading last ${history.length} messages`);

        history.forEach((msg)=>{
            console.log(`[${msg.sender}]: ${msg.text}`);
        });

    }
    rl.prompt(true);
});


socket.on("recieve_message", (data) => {
  // Only print if it's from someone else in the same room
  if (data.sender !== username) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log(`\n[${data.sender}]: ${data.text}`);
    rl.prompt(true);
  }
});

function initSession() {
  rl.question("Enter Room Name: ", (r) => {
    room = r.trim();
    if (!room) return initSession();

    // Fire backend room assignment
    socket.emit("join_room", room);
    console.log(`\n--- Inside Room: ${room} ---`);

    rl.setPrompt(`${username}> `);
    rl.prompt();
    handleTyping();
  });
}

function handleTyping() {
  rl.on("line", (line) => {
    const messageText = line.trim();
    if (messageText) {
      // The server fills in the sender from the authenticated socket
      socket.emit("send_message", {
        room: room,
        text: messageText
      });
    }
    rl.prompt();
  });
}

