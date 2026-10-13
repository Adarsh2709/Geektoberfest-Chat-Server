// A stand-in for socket.io-client: the test pushes server events in and inspects what the app emits.
class FakeSocket {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.connected = false;
    this.handlers = {};
    this.emitted = [];
    FakeSocket.last = this;
  }

  on(name, handler) {
    (this.handlers[name] ||= []).push(handler);
    return this;
  }

  // Pretends to be the server: runs every handler the app registered for this event.
  serverEmit(name, ...args) {
    (this.handlers[name] || []).forEach((handler) => handler(...args));
  }

  connect() {
    this.connectCalls = (this.connectCalls || 0) + 1;
    return this;
  }

  disconnect() {
    this.connected = false;
    return this;
  }

  // Simulates the connection coming up.
  open() {
    this.connected = true;
    this.serverEmit('connect');
  }

  emit(name, ...args) {
    this.emitted.push({ name, args });
    return this;
  }

  timeout() {
    return { emit: (name, payload, callback) => { this.emitted.push({ name, args: [payload], callback }); } };
  }

  sent(name) {
    return this.emitted.filter((entry) => entry.name === name);
  }
}

module.exports = { io: (url, options) => new FakeSocket(url, options), FakeSocket };
