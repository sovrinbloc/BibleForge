<?php

/**
 * BibleForge
 *
 * @date    08-30-09
 * @version 0.1 alpha 2
 * @link http://BibleForge.com
 * @license Reciprocal Public License 1.5 (RPL1.5)
 */

/**
 * Configure the constants to match your environment,
 * and then rename this file to config.php.
 */

/// MySQL
define('DB_SERVER', '127.0.0.1'); ///NOTE: Use the typical MySQL sever format (hostname[:(port|socket)]).
define('DB_USERNAME', 'root');
define('DB_PASSWORD', '');
define('DB_NAME', 'bf');

/// Sphinx
define('SPHINX_API', 'sphinxapi'); /// Which API to use (i.e., 'sphinxapi' or 'sphinxapi_cli')
define('SPHINX_SERVER', '127.0.0.1'); /// The Sphinx host address (sphinxapi) or the path to search executable (sphinxapi_cli)
define('SPHINX_PORT', 9312); /// Port number (sphinxapi) or path to sphinx config file (sphinxapi_cli)
