// A minimal in-process Redis: just enough RESP for ioredis to connect and for PUBLISH/SUBSCRIBE to
// work, which is all the chat backend uses. It lets the tests run without installing Redis.
const net = require('node:net');

const encode = (value) => {
  if (Array.isArray(value)) return `*${value.length}\r\n${value.map(encode).join('')}`;
  if (typeof value === 'number') return `:${value}\r\n`;
  if (value === null) return '$-1\r\n';
  return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
};

// Splits a buffer into complete commands and returns what is left over.
function parse(buffer) {
  const commands = [];
  let index = 0;
  while (index < buffer.length && buffer[index] === 42) {
    const lineEnd = buffer.indexOf('\r\n', index);
    if (lineEnd < 0) break;
    const count = Number(buffer.slice(index + 1, lineEnd));
    let position = lineEnd + 2;
    const args = [];
    let complete = true;
    for (let i = 0; i < count; i++) {
      const headerEnd = position < buffer.length ? buffer.indexOf('\r\n', position) : -1;
      if (headerEnd < 0) { complete = false; break; }
      const length = Number(buffer.slice(position + 1, headerEnd));
      if (headerEnd + 2 + length + 2 > buffer.length) { complete = false; break; }
      args.push(buffer.slice(headerEnd + 2, headerEnd + 2 + length).toString());
      position = headerEnd + 2 + length + 2;
    }
    if (!complete) break;
    commands.push(args);
    index = position;
  }
  return [commands, buffer.slice(index)];
}

function startRedisStub() {
  const channels = new Map();

  const server = net.createServer((socket) => {
    let rest = Buffer.alloc(0);
    socket.on('data', (data) => {
      const [commands, remaining] = parse(Buffer.concat([rest, data]));
      rest = remaining;
      for (const [name, ...args] of commands) {
        const command = name.toUpperCase();
        if (command === 'HELLO') {
          // Not RESP3: ioredis falls back to the older protocol.
          socket.write("-ERR unknown command 'hello'\r\n");
        } else if (command === 'INFO') {
          socket.write(encode('redis_version:7.0.0\r\nloading:0\r\n'));
        } else if (command === 'SUBSCRIBE') {
          args.forEach((channel, i) => {
            if (!channels.has(channel)) channels.set(channel, new Set());
            channels.get(channel).add(socket);
            socket.write(encode(['subscribe', channel, i + 1]));
          });
        } else if (command === 'PUBLISH') {
          const subscribers = channels.get(args[0]) || new Set();
          subscribers.forEach((subscriber) => subscriber.write(encode(['message', args[0], args[1]])));
          socket.write(encode(subscribers.size));
        } else if (command === 'QUIT') {
          socket.write('+OK\r\n');
          socket.end();
        } else {
          socket.write('+OK\r\n');
        }
      }
    });
    socket.on('close', () => channels.forEach((subscribers) => subscribers.delete(socket)));
    socket.on('error', () => {});
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port,
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}

module.exports = { startRedisStub };
