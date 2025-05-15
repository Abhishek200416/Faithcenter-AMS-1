// backend/models/preset.js
const { DataTypes } = require('sequelize');

module.exports = sequelize => {
    const Preset = sequelize.define('Preset', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        date: {
            // YYYY-MM-DD
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        time: {
            // HH:mm:ss
            type: DataTypes.TIME,
            allowNull: false
        },
        duration: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 10
        },
        early: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5
        },
        late: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5
        },
        absent: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 45
        },
        earlyMsg: {
            type: DataTypes.STRING,
            allowNull: true
        },
        onTimeMsg: {
            type: DataTypes.STRING,
            allowNull: true
        },
        lateMsg: {
            type: DataTypes.STRING,
            allowNull: true
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'presets',
        timestamps: true
    });

    Preset.associate = models => {
        Preset.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'owner'
        });
    };

    return Preset;
};