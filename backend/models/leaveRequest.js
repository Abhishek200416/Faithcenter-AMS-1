// backend/models/leaveRequest.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const LeaveRequest = sequelize.define('LeaveRequest', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        fromDate: {
            type: DataTypes.DATE,
            allowNull: false
        },
        toDate: {
            type: DataTypes.DATE,
            allowNull: false
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('pending', 'approved', 'rejected'),
            defaultValue: 'pending'
        },
        // ← new columns:
        requestTo: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'category-admin'
        },
        note: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'leave_requests',
        timestamps: true
    });

    LeaveRequest.associate = models => {
        LeaveRequest.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    };

    return LeaveRequest;
};