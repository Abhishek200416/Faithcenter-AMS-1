// backend/models/locationCheck.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const LocationCheck = sequelize.define('LocationCheck', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        latitude: {
            type: DataTypes.DECIMAL(9, 6),
            allowNull: false
        },
        longitude: {
            type: DataTypes.DECIMAL(9, 6),
            allowNull: false
        },
        radius: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 100
        },
        startAt: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: DataTypes.NOW
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        userIds: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
        },
        earlyWindow: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: null
        },
        lateWindow: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: null
        },
        duration: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: null
        },
        isDefault: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        scheduleType: {
            type: DataTypes.ENUM('once', 'weekly'),
            allowNull: false,
            defaultValue: 'once'
        },
        daysOfWeek: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: []
        },
        specificDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        startTime: {
            type: DataTypes.TIME,
            allowNull: true,
            defaultValue: null
        },
        endTime: {
            type: DataTypes.TIME,
            allowNull: true,
            defaultValue: null
        },
        remindBeforeMins: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: null
        },
        earlyMsg: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: null
        },
        onTimeMsg: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: null
        },
        lateMsg: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: null
        },
        category: {
            type: DataTypes.STRING,
            allowNull: true
        },
        outGrace: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: null
        },
        attendanceType: {
            type: DataTypes.ENUM('normal', 'full'),
            allowNull: false,
            defaultValue: 'normal'
        },

        issuedBy: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'location_checks',
        timestamps: true
    });

    LocationCheck.associate = models => {
        LocationCheck.belongsTo(models.User, { foreignKey: 'issuedBy', as: 'issuer' });
    };

    return LocationCheck;
};