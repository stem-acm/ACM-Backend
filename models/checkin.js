'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Checkin extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Checkin.init({
    registrationNumber: DataTypes.STRING,
    activityId: DataTypes.INTEGER,
    checkInTime: DataTypes.DATE,
    checkOutTime: DataTypes.DATE,
    visitReason: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Checkin',
  });
  return Checkin;
};