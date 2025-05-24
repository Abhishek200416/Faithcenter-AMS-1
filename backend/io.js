// backend/io.js
const { Server } = require('socket.io');

let io = null;

module.exports = {
    init: (httpServer) => {
        io = new Server(httpServer, {
            cors: { origin: ['http://localhost:3000'] }
        });
        return io;
    },
    getIo: () => {
        if (!io) throw new Error('Socket.io not initialized');
        return io;
    }
};