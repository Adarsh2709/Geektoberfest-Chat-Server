import { io } from "socket.io-client";
import readline from "readline";

console.log("Connecting directly to Socket.io backend...");

// Bypasses local DNS resolution glitches by forcing standard polling-first handshakes
const socket = io("https://chat-server-2-fzyd.onrender.com", {
  transports: ["polling", "websocket"],
  forceNew: true,
  autoConnect: true
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let username = "";
let room = "";

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
  rl.question("Choose Username: ", (u) => {
    username = u.trim();
    if (!username) return initSession();

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
  });
}

function handleTyping() {
  rl.on("line", (line) => {
    const messageText = line.trim();
    if (messageText) {
      // Matches the const { room, sender, text } object unpack structure in server.js
      socket.emit("send_message", {
        room: room,
        sender: username,
        text: messageText
      });
    }
    rl.prompt();
  });
}

