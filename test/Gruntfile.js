/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

module.exports = function(grunt) {
  grunt.initConfig({
    shell: {
      target: 'npm test'
    },
    watch: {
      files: ['**/*', '!node_modules/**/*', '!bower_components/**/*'],
      tasks: ['shell']
    }
  });
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-shell');
};
