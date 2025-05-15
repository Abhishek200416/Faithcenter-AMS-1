// backend/models/attendance.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Attendance = sequelize.define('Attendance', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false
        },
        type: {
            type: DataTypes.ENUM('punch-in', 'punch-out'),
            allowNull: false
        },
        timestamp: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        status: {
            type: DataTypes.ENUM('early', 'on-time', 'late', 'absent'),
            allowNull: false
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: true
        },
        // new column to tie each punch to a specific QR token
        qrToken: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        tableName: 'attendances',
        timestamps: false
    });

    Attendance.associate = models => {
        Attendance.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'user'
        });
    };

    return Attendance;
};