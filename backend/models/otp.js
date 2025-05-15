const { DataTypes } = require('sequelize');
module.exports = sequelize => {
    const OTP = sequelize.define('OTP', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        code: {
            type: DataTypes.STRING(6),
            allowNull: false
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false
        }
    }, {
        tableName: 'otps',
        timestamps: true
    });

    OTP.associate = models => {
        OTP.belongsTo(models.User, { foreignKey: 'userId' });
    };

    return OTP;
};