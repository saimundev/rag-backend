export const returnSuccess = (data, success, message, statusCode) => {
  return {
    data,
    success,
    message,
    statusCode,
  };
};

export const returnError = (message, statusCode) => {
  return {
    data: null,
    success: false,
    message,
    statusCode,
  };
};
