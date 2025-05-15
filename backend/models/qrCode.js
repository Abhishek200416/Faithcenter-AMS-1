// backend/models/qrcode.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const QRCode = sequelize.define('QRCode', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        token: {
            type: DataTypes.STRING,
            allowNull: false
        },
        liveAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false
        },

        // attendance windows
        earlyWindow: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        lateWindow: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        duration: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 10
        },

        // custom feedback messages
        earlyMsg: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: ''
        },
        onTimeMsg: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: ''
        },
        lateMsg: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: ''
        },

        category: {
            type: DataTypes.STRING,
            allowNull: true
        },
        issuedBy: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'qrcodes',
        timestamps: true
    });

    QRCode.associate = (models) => {
        QRCode.belongsTo(models.User, {
            foreignKey: 'issuedBy',
            as: 'issuer'
        });
    };

    return QRCode;
};