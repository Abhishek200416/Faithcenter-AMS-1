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
        // if you want to track which LocationCheck triggered it:
        locationCheckId: {
            type: DataTypes.UUID,
            allowNull: true
        },
        type: {
            type: DataTypes.ENUM('punch-in', 'punch-out'),
            allowNull: false
        },
        timestamp: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        // For “normal” mode you'll still use status; for “full” maybe null
        status: {
            type: DataTypes.ENUM('early', 'on-time', 'late', 'absent'),
            allowNull: true
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        tableName: 'attendances',
        timestamps: false
    });

    Attendance.associate = models => {
        // link back to the user
        Attendance.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'user'
        });
        // link back to the location-check (so you can read its attendanceType)
        Attendance.belongsTo(models.LocationCheck, {
            foreignKey: 'locationCheckId',
            as: 'locationCheck'
        });
    };

    return Attendance;
};