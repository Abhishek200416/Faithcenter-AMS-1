// backend/io.js
// backend/io.js
const { Server } = require('socket.io');
let io = null;

module.exports = {
    init(httpServer) {
        io = new Server(httpServer, {
            cors: {
                origin: [
                    'https://faithcenterams.up.railway.app',
                    'http://localhost',
                    'https://localhost',
                    'capacitor://localhost',
                    'ionic://localhost'
                ],
                credentials: true,
                methods: ['GET', 'POST', 'OPTIONS']
            }
        });
        return io;
    },
    getIo() {
        if (!io) throw new Error('Socket.io not initialized');
        return io;
    }
};