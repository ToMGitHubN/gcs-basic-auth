"use strict";

if (process.env.STACKDRIVER_DEBUGGER === "true") {
  require("@google-cloud/debug-agent").start();
}

const request = require("request");
var url = require("url");

const express = require("express");
const app = express();

const { Storage } = require("@google-cloud/storage");
const storage = new Storage();

// basic auth setting
const basicAuthConnect = require("basic-auth-connect");
const basicAuth =
  process.env.BASIC_AUTH_ENABLED === "true"
    ? basicAuthConnect(
        process.env.BASIC_AUTH_NAME,
        process.env.BASIC_AUTH_PASSWORD
      )
    : (req, res, next) => {
        next();
      };

// bucket
const bucket = storage.bucket(process.env.BUCKET_NAME);

// Google Cloud Storage generateSignedUrl Life time
const GCS_URL_LIFETIME = parseInt(process.env.GCS_URL_LIFETIME);

//transfer option
const TRANSFER_MODE = process.env.TRANSFER_MODE;
const ALLOW_DIRECT_LIST = JSON.parse(process.env.ALLOW_DIRECT_LIST);
const ALLOW_REDIRECT_LIST = JSON.parse(process.env.ALLOW_REDIRECT_LIST);

// default page
const DEFAULT_HTML = process.env.DEFAULT_PAGE;
// 404 page
const NOT_FOUND_HTML = process.env.NOT_FOUND_PAGE;

// Constants
const REDIRECT = "REDIRECT";
const SIGNEDURL = "SIGNEDURL";
const FILE_NOT_FOUND = "FILE_NOT_FOUND";

/**
 * file exists check
 *
 * return bool true=file exist
 */
async function checkFileExists(filename) {
  const [exists] = await bucket
    .file(filename)
    .exists()
    .catch((err) => {
      throw err;
    });

  return exists;
}

/**
 * Google Cloud Storage Generate Signerate URL
 *
 * @param {string} filepath
 * @return {string} Signerate URL
 */
async function generateSignedUrl(filepath) {
  const options = {
    action: "read",
    expires: Date.now() + GCS_URL_LIFETIME,
  };

  // Get a signed URL for the file
  const [url] = await bucket.file(filepath).getSignedUrl(options);

  return url;
}

async function fileSearch(url_parse) {
  let path_name = url_parse.pathname;

  if (path_name.slice(-1) === "/") {
    path_name = path_name.slice(0, -1); // remove tail '/'
  }

  if (path_name.slice(0, 1) === "/") {
    path_name = path_name.slice(1); // remove head '/'
  }

  let is_file = false; //file find flg

  if (path_name !== "") {
    is_file = await checkFileExists(path_name); //file check
  }

  if (is_file === false) {
    //file not found

    if (path_name !== "") {
      path_name = path_name + "/";
    }

    if (await checkFileExists(`${path_name}${DEFAULT_HTML}`)) {//check defalut html
      
      is_file = true;
      path_name = `${path_name}${DEFAULT_HTML}`;
    }

    if (is_file === false) {
      //defalut html not found

      if (await checkFileExists(NOT_FOUND_HTML)) {
        // check 404 html
        is_file = true;
        path_name = NOT_FOUND_HTML;
      } else {
        return [FILE_NOT_FOUND, ""];
      }
    }
  }

  let file_signed_url = await generateSignedUrl(path_name);

  if (TRANSFER_MODE === "ALL_DIRECT") {
    return [SIGNEDURL, file_signed_url];
  } else {
    const file_split_ext = path_name.split(".");
    if (file_split_ext.length > 0) {
      const file_ext = file_split_ext[file_split_ext.length - 1].toLowerCase();

      if (
        TRANSFER_MODE === "ALLOW_DIRECT" &&
        ALLOW_DIRECT_LIST.indexOf(file_ext) >= 0
      ) {
        return [SIGNEDURL, file_signed_url]; //target transfer files
      } else if (
        TRANSFER_MODE === "ALLOW_REDIRECT" &&
        ALLOW_REDIRECT_LIST.indexOf(file_ext) === -1
      ) {
        return [SIGNEDURL, file_signed_url]; //target transfer files
      }
    }
  }

  //redirect path
  if (url_parse.query) {
    //check get param
    file_signed_url = file_signed_url + "?" + url_parse.query;
  }

  return [REDIRECT, file_signed_url];
}

/**
 * helath check
 */
app.get("/_ah/start", (req, res) => {
  res.send("I am alive.");
});

/**
 * main url listener
 */
app.get("/*", basicAuth, (req, res) => {
  const url_parse = url.parse(req.url);

  fileSearch(url_parse).then((result) => {
    const [result_status, result_url] = result;

    if (result_status === REDIRECT) {
      res.redirect(result_url);
    } else if (result_status === SIGNEDURL) {
      const proxyRequestHeaders = Object.assign({}, req.headers);
      for (let key of ["host", "authorization", "cookie"]) {
        if (key in proxyRequestHeaders) {
          delete proxyRequestHeaders[key];
        }
      }

      request({
        url: result_url,
        method: req.method,
        headers: proxyRequestHeaders,
      }).pipe(res);
    } else if (result_status === FILE_NOT_FOUND) {
      res.status(404).end("404 Not Found");
    } else {
      //It will never reach this code
      res.status(500).end("500 Internal Server Error");
    }
  });
});

/**
 * server start
 */
const server = app.listen(8080);
