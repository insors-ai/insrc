// The standalone installer owns this scope before a daemon registry exists.
scope.start('git', ['ls-remote', '--heads', repository, branch]);
