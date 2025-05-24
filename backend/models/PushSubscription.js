// backend/models/pushSubscription.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const PushSubscription = sequelize.define('PushSubscription', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false
        },
        endpoint: {
            type: DataTypes.STRING,
            allowNull: false
        },
        keys: {
            type: DataTypes.JSON, // For storing p256dh and auth keys
            allowNull: false
        }
    }, {
        tableName: 'push_subscriptions',
        timestamps: true
    });

    PushSubscription.associate = models => {
        PushSubscription.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    };

    return PushSubscription;
};