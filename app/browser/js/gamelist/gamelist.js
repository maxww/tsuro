tsuro.config(function ($stateProvider) {
    $stateProvider.state('gamelist', {
        url: '/gamelist',
        templateUrl: '/browser/js/gamelist/gamelist.html',
        controller: 'gameList',
    });
});

tsuro.controller('gameList', function ($scope, firebaseUrl, $firebaseObject, $state, $firebaseAuth, $firebaseArray) {
    //For synchronizingGameList...
    var ref = firebase.database().ref();
    var obj = $firebaseObject(ref);

    var auth = $firebaseAuth();
    var firebaseUser = auth.$getAuth();

    var synchRef = ref.child("games");
    var synchronizedObj = $firebaseObject(synchRef);


    // This returns a promise...you can.then() and assign value to $scope.variable
    // gamelist is whatever we are calling it in the angular html.
    synchronizedObj.$bindTo($scope, "gamelist")
        .then(function () {
            var gamelist = [];
            for (var i in $scope.gamelist) {
                gamelist.push([i, $scope.gamelist[i]]);
            }
            $scope.gameNames = gamelist.slice(2);
            console.log($scope.gameNames);
        });




    $scope.join = function (gameName) {
        var gameNameRef = ref.child('games').child(gameName);
        var playersRef = gameNameRef.child('players');
        var firebasePlayersArr = $firebaseArray(playersRef);

        firebase.auth().onAuthStateChanged(function (user) {

            firebasePlayersArr.$loaded().then(function (data) {
                    var FBplayers = data;

                    if (user) {
                        if (!FBplayers.filter(function (player) {
                                return player.uid === user.uid;
                            }).length) {
                            var newPlayer = {
                                uid: user.uid,
                                name: user.displayName
                            };
                            firebasePlayersArr.$add(newPlayer);
                        }
                    } else {
                        // No user is signed in.
                        console.log("nothing");
                    }
                })
                .then(function () {
                    $state.go('game', {
                        "gameName": gameName
                    });
                });
        });
    };
});
