// backend/io.js
const { Server } = require('socket.io');

module.exports = {
    init: (httpServer) => {
        // mirror your Express CORS origins exactly:
        const allowedOrigins = [
            'https://faithcenterams.up.railway.app',
            'http://localhost',
            'https://localhost',
            'capacitor://localhost',
            'ionic://localhost'
        ];

        const io = new Server(httpServer, {
            cors: {
                origin: allowedOrigins,
                credentials: true,
                methods: ['GET', 'POST', 'OPTIONS']
            }
        });

        // (optionally attach your event handlers here)
        return io;
    },
    getIo: () => {
        throw new Error('Socket.io not initialized');
    }
};