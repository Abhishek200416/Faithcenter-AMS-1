// backend/models/user.js
const { DataTypes } = require('sequelize');

module.exports = sequelize => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        uid: {
            type: DataTypes.STRING(10),
            unique: true,
            allowNull: false
        },
        username: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false
        },
        usernameChangedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false,
            validate: { isEmail: true }
        },
        phone: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: true
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },

        // Roles remain: developer, admin, category-admin, usher
        role: {
            type: DataTypes.ENUM('developer', 'admin', 'category-admin', 'usher'),
            allowNull: false,
            defaultValue: 'usher'
        },

        // Only bare categories now
        categoryType: {
            type: DataTypes.ENUM('admin', 'protocol', 'media', 'worship', 'ushering'),
            allowNull: true
        },

        gender: {
            type: DataTypes.ENUM('male', 'female'),
            allowNull: false
        },
        age: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: { min: 0 }
        }
    }, {
        tableName: 'users',
        timestamps: true
    });

    User.associate = models => {
        User.hasMany(models.Attendance, { foreignKey: 'userId' });
        User.hasMany(models.LeaveRequest, { foreignKey: 'userId' });
        User.hasMany(models.QRCode, { foreignKey: 'issuedBy', as: 'issuedQRs' });
        User.hasMany(models.OTP, { foreignKey: 'userId' });
    };

    return User;
};