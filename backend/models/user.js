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
        // NEW: how many changes in current 30-day window (nullable for existing rows)
        usernameChangeCount: {
            type: DataTypes.INTEGER,
            allowNull: true, // changed from false → true
            defaultValue: 0
        },
        // NEW: timestamp when current window started (nullable for existing rows)
        usernameChangeWindowStart: {
            type: DataTypes.DATE,
            allowNull: true, // changed from false → true
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
        role: {
            type: DataTypes.ENUM('developer', 'admin', 'category-admin', 'usher'),
            allowNull: false,
            defaultValue: 'usher'
        },
        categoryType: {
            type: DataTypes.ENUM('admin', 'protocol', 'media', 'worship', 'ushering', 'developer'),
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