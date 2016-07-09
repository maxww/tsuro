tsuro.config(function($stateProvider) {
    $stateProvider.state('game', {
        url: '/game/:gameName',
        templateUrl: '/browser/js/game/game.html',
        controller: 'gameCtrl'
    });
});

tsuro.controller('gameCtrl', function($scope, $firebaseAuth, firebaseUrl, $stateParams, $firebaseObject, $firebaseArray, $state, gameFactory) {


    var ref = firebase.database().ref();
    var obj = $firebaseObject(ref);

    var gameRef = ref.child('games').child($stateParams.gameName);
    var gameArr = gameRef.child($stateParams.gameName);

    var initialDeckRef = ref.child('games').child($stateParams.gameName).child('initialDeck');
    var initialDeckArr = $firebaseArray(initialDeckRef);

    var deckRef = gameRef.child('deck');
    var deckArr = $firebaseArray(deckRef);

    var currPlayerRef = gameRef.child('currentPlayerIndex');

    var playersRef = gameRef.child('players');
    var firebasePlayersArr = $firebaseArray(playersRef);

    var markersRef = gameRef.child('availableMarkers');
    var markersArr = $firebaseArray(markersRef);

    var spaceRef = ref.child('games').child($stateParams.gameName).child('spaces');
    var spaceObj = $firebaseObject(spaceRef);
    var spaceArr = $firebaseArray(spaceRef);


    /****************
    INITIALIZING GAME
    ****************/

    // new local game with game name defined by url
    $scope.game = new Game($stateParams.gameName);

    // Start with first player in the array, index 0
    $scope.game.currentPlayerIndex = 0;

    // when the deck is loaded, local deck is the firebase deck
    deckArr.$loaded().then(function() {
        $scope.game.deck.tiles = deckArr[0];
        console.log("new deck made: ", $scope.game.deck);
    });

    // don't start watching players until there is a deck in the game
    // 'child_changed'
    playersRef.on("value", function(snap) {
        // grab the value of the snapshot (all players in game in Firebase)
        var snapPlayers = snap.val();

        // for each player in this collection...
        for (var thisPlayer in snapPlayers) {
            var existingPlayerIndex, thisIsANewPlayer;

            // find this 'snap' player's index in local game. find returns that value.
            var localPlayer = $scope.game.players.find(function(plyr, plyrIdx) {
                existingPlayerIndex = plyrIdx;
                return plyr.uid === snapPlayers[thisPlayer].uid;
            });

            // if not found, create new player
            if (!localPlayer) {
                console.log('i didnt find a local player!');
                localPlayer = new Player(snapPlayers[thisPlayer].uid);
                thisIsANewPlayer = true;
            }

            // for each key in the snapPlayer's keys, add that key and value to local player
            for (var playerproperty in snapPlayers[thisPlayer]) {
                localPlayer[playerproperty] = snapPlayers[thisPlayer][playerproperty];
            }

            //push local player to game.players
            if (thisIsANewPlayer) $scope.game.players.push(localPlayer);
            else $scope.game.players[existingPlayerIndex] = localPlayer;
        }
        // on login, find me in the $scope.game players array
        firebase.auth().onAuthStateChanged(function(user) {
            firebasePlayersArr.$loaded()
                .then(function(player) {
                    if (user) {
                        $scope.me = $scope.game.players.find((player) => player.uid === user.uid);

                        $scope.meIdx;
                        player.find((player, i) => {
                            if (player.uid === user.uid) $scope.meIdx = i
                        });

                        $scope.me.marker = player[$scope.meIdx].marker;
                        $scope.clicked = player[$scope.meIdx].clicked;
                        $scope.me.x = player[$scope.meIdx].x;
                        $scope.me.y = player[$scope.meIdx].y;
                        $scope.me.i = player[$scope.meIdx].i;
                        $scope.game.currentPlayer = $scope.game.players[$scope.game.currentPlayerIndex];
                        $scope.myTurn = $scope.me.uid === $scope.game.currentPlayer.uid && $scope.me.canPlay === true;
                    } else {
                        console.log("no one is logged in");
                    }
                    console.log('im here!!!!!!!!');
                });
        });
    });


    // when that markers array is loaded, update the available markers array on scope
    markersArr.$loaded().then(function(data) {
        $scope.game.availableMarkers = data[0];
    });

    //if someone else picks a marker, update your view
    markersRef.on('child_changed', function(data) {
        $scope.game.availableMarkers = data.val();
    });

    $scope.spaces = _.flatten($scope.game.board);

    currPlayerRef.on('value', function(snapshot) {
        console.log("currentPlayerIndexPlayer index changes", snapshot.val())
        $scope.game.currentPlayerIndex = snapshot.val();
        $scope.game.currentPlayer = $scope.game.players[$scope.game.currentPlayerIndex];
        console.log("scope.game.currentPlayerIndex", $scope.game.currentPlayerIndex);

        if (spaceArr.length >= 1) {
            console.log("inside if", spaceArr)
            $scope.myTurn = $scope.me.uid === $scope.game.currentPlayer.uid && $scope.me.canPlay === true;
            console.log("IS IT MY TURN?", $scope.myTurn);
        }
    });

    /****************
    AVAILABLE PLAYER ACTIONS AT GAME START
    ****************/

    $scope.pickMarker = function(marker) {
        pickMarkerFn(marker);
    };

    function pickMarkerFn(marker) {
        $scope.me.marker = marker;

        firebasePlayersArr[$scope.meIdx].marker = marker;
        firebasePlayersArr.$save($scope.meIdx);

        var idx = $scope.game.availableMarkers.indexOf(marker);

        markersArr[0].splice(idx, 1);

        markersArr.$save(0)
            .then(function() {
                console.log("removed the picked marker");
            });
    }

    // once placed the marker, cannot place again
    $scope.clicked = false;

    //  Have player pick their start point
    $scope.placeMarker = function(point) {
        placeMarkerFn(point);
    };

    var placeMarkerFn = function(point) {
        $scope.me.placeMarker(point, $scope.game.board);
        $scope.me.tiles = $scope.game.deal(3);
        syncDeck();
        console.log("my tiles", $scope.me.tiles);
        $scope.me.clicked = true;

        // FOR SOME REASON I can't just do firebasePlayersArr[$scope.meIdx] = $scope.me;
        firebasePlayersArr[$scope.meIdx].tiles = $scope.me.tiles;
        firebasePlayersArr[$scope.meIdx].x = $scope.me.x;
        firebasePlayersArr[$scope.meIdx].y = $scope.me.y;
        firebasePlayersArr[$scope.meIdx].i = $scope.me.i;
        firebasePlayersArr[$scope.meIdx].clicked = true;
        firebasePlayersArr[$scope.meIdx].canPlay = true;
        firebasePlayersArr.$save($scope.meIdx);

        return false;
    };

    /****************
    GAMEPLAY ACTIONS
    ****************/
    $scope.tryTile = function(tile) {

        $scope.game.board[$scope.me.y][$scope.me.x].image = tile.imageUrl;
        $scope.game.board[$scope.me.y][$scope.me.x].rotation = tile.rotation;
        $scope.game.board[$scope.me.y][$scope.me.x].testing = true;

        $scope.chosenTile = tile;

        // CMT: need this line here in order to update the $scope.spaces for the html
        $scope.spaces = _.flatten($scope.game.board);
    };


    $scope.playerOnThisSpace = function(space) {
        var players = $scope.game.players;
        var player = null;

        for (var i = 0; i < players.length; i++) {
            if (players[i].x === space.x && players[i].y === space.y) player = players[i];
        }
        if (!player) return null;
        return player;
    };

    $scope.playerIndex = function(player) {
        if (player) {
            switch (player.i) {
                case 0:
                    return "zero";
                case 1:
                    return "one";
                case 2:
                    return "two";
                case 3:
                    return "three";
                case 4:
                    return "four";
                case 5:
                    return "five";
                case 6:
                    return "six";
                case 7:
                    return "seven";
                default:
                    break;
            }
        }
    };

    $scope.markerColor = function(player) {
        if (player) return player.marker;
    };

    // TODO: need a function to assign dragon
    $scope.dragon;
    $scope.dragonQueue = [];


    $scope.myTurn = function() {
        $scope.me === $scope.currentPlayer;
    };

    $scope.rotateTileCw = function(tile) {
        tile.rotation++;
        //set rotation to be between 0 and 3
        if (tile.rotation === 4) tile.rotation = 0;
    };


    $scope.rotateTileCcw = function(tile) {
        tile.rotation--;
        // set rotation to be between -0 and -3
        if (tile.rotation === -4) tile.rotation = 0;
        // set it to be between +0 and +3
        if (tile.rotation < 0) tile.rotation += 4;
    };


    $scope.placeTile = function(tile) {
        //clearing out the deadPlayers array in firebase first
        var deadPlayersArr = $firebaseArray(gameRef.child('deadPlayers'));
        console.log(deadPlayersArr);
        console.log(deadPlayersArr.length);

        //JUST IN CASE: if we want to remove players....
        // deadPlayersArr.$loaded(function(players) {
        //     console.log(players);
        //     for (var i = 0; i < players.length; i++) {
        //         deadPlayersArr.$remove(i).then(function(ref) {
        //             console.log('I am removed');
        //         });
        //     }
        // })

        var spacex = $scope.me.x;
        var spacey = $scope.me.y;
        var tileId = tile.id;
        var tileImg = tile.imageUrl;
        var rotation = tile.rotation;

        $scope.me.tiles = $scope.me.tiles.filter(t => t.id !== tile.id);
        firebasePlayersArr[$scope.meIdx].tiles = $scope.me.tiles;
        firebasePlayersArr.$save($scope.meIdx);

        //This will send the tile to spaces 
        placeTileOnSpace(spacex, spacey, tileId, tileImg, rotation);
    };

    function placeTileOnSpace(x, y, tileId, img, rotate) {

        var spaceId = 'space' + x + y;
        console.log(`spaceId = ${spaceId}`);
        spaceObj[spaceId] = {
            'tileId': tileId,
            'img': img,
            'rotation': rotate
        };
        spaceObj.$save();
    };


    function checkDeath() {
        console.log($scope.game.getCanPlay().length);
        console.log($scope.game.getCanPlay());
        //if all 35 cards are placed - everyone left with the canPlay property WINS
        if (spaceArr.length === 35) {
            console.log('everyone who canPlay wins');
            $scope.winner = $scope.game.getCanPlay(); //returns an array of canPlay players

            //Adding the winner into firebase
            $scope.winner.forEach(winner => $firebaseArray(gameRef.child('winners')).$add({ 'name': winner.name }));
            $scope.gameOver = true;
        }
        //if only 1 last player on the board - winner
        else if ($scope.game.getCanPlay().length === 1) {
            console.log('game over! last one alive wins!');
            $scope.winner = $scope.game.getCanPlay();
            console.log($scope.game.getCanPlay());

            //Adding the winner into firebase
            console.log($scope.game.getCanPlay()[0].uid);
            console.log($scope.me.uid);

            // if ($scope.game.getCanPlay()[0].uid === $scope.me.uid) {
            //     $firebaseArray(gameRef.child('winners')).$add({ 'name': $scope.game.getCanPlay()[0].name });
            // }

            $firebaseArray(gameRef.child('winners')).$add({ 'name': $scope.game.getCanPlay()[0].name });
            $scope.gameOver = true;
        }

        //if no one is left with the canPlay property - no winner
        else if (!$scope.game.getCanPlay().length) {
            console.log('game over! no one wins');
            $scope.gameOver = true;
        }
    }

    spaceRef.on('child_added', function(snapshot) {

        console.log("got a tile", snapshot.val());
        var addedTile = snapshot.val();
        var spaceKey = snapshot.key;
        var x = +spaceKey.slice(-2, -1);
        var y = +spaceKey.slice(-1);
        var space = $scope.game.board[y][x]; // look space up in game.board

        space.image = addedTile.img;
        space.rotation = addedTile.rotation;
        var tile = gameFactory.tiles[addedTile.tileId]; // look up tile by id
        var rotatedTile = gameFactory.rotateTile(tile, snapshot.val().rotation);

        for (var i = 0; i < rotatedTile.paths.length; i++) {
            if ($scope.game.players.length) {
                $scope.game.players.forEach(function(player) {
                    if (player.x === x && player.y === y && player.i === i) {
                        space.points[i].travelled = true;
                    }
                });
            }
            // if the point doesn't have neighbors... set to empty array
            if (!space.points[i].neighbors) space.points[i].neighbors = [];

            // set each point's neighbors to it's corresponding point
            space.points[i].neighbors.push(space.points[rotatedTile.paths[i]]);
        }

        // trigger move
        if ($scope.me) {
            console.log("spaceRef", x, $scope.me.x)
            if ($scope.me.x === x && $scope.me.y === y) {
                $scope.me.move($scope.game.board);
                firebasePlayersArr[$scope.meIdx].x = $scope.me.x;
                firebasePlayersArr[$scope.meIdx].y = $scope.me.y;
                firebasePlayersArr[$scope.meIdx].i = $scope.me.i;
                firebasePlayersArr[$scope.meIdx].canPlay = $scope.me.canPlay;
                firebasePlayersArr.$save($scope.meIdx);
            }
            console.log($scope.me.canPlay);
            //if i die on b/c of a move, send me up to firebase as a dead player
            console.log($scope.me.tiles.length);
            if (!$scope.me.canPlay && $scope.me.tiles.length) {
                console.log($scope.game.deck);
                console.log($scope.me.tiles);

                // When shuffling the newly added cards, the _shuffle function alters some of the cards in the deck to become undefined, so we are just add the tiles to the end of the deck and not re-shuffling

                // $scope.game.deck.reload($scope.me.tiles).shuffle();
                $scope.game.deck.reload($scope.me.tiles);
                console.log($scope.game.deck);

                syncDeck();

                console.log('do this when i am dead!');
                $scope.me.tiles = [];

                //Upating the player 
                firebasePlayersArr[$scope.meIdx].tiles = $scope.me.tiles;
                firebasePlayersArr.$save($scope.meIdx);
                console.log('remove my tiles if i die');

                $firebaseArray(gameRef.child('deadPlayers')).$add({ 'name': $scope.me.name });
                console.log($scope.me.name);
            }

            checkDeath();

            let firebaseDragonArr = $firebaseArray(gameRef.child('dragonQueue'));
            let dragonRef = gameRef.child('dragon');
            //DRAGON
            //if no card in the deck push in dragonQueue;
            console.log($scope.game.deck.length());
            if (!$scope.game.deck.length()) {

                console.log("deck is empty");
                $scope.dragonQueue.push($scope.me)
                    //push to Firebase
                firebaseDragonArr.$add($scope.me.uid);
                console.log(`added myself to the dragonQueue`);
                //scope.dragon =current dragon or next in queue;
                $scope.dragon = $scope.dragon || $scope.dragonQueue.shift();
                // console.log(`current dragon is ${scope.dragon}`);
                //upload dragon info to Firebase - uid

                dragonRef.set({ 'uid': $scope.me.uid })
            } else {
                console.log(`deck has cards`);
                // // if deck and dragon deal to dragonQueue first until players have 3 tiles
                // while ($scope.dragon && $scope.deck.length>0) {
                //  console.log(`serving dragonQueue first`);
                //  if($scope.dragon.tiles.length<3)$scope.dragon.tiles.concat($scope.game.deal(1))
                //  console.log(`${$scope.dragon} dealt card`);
                //  $scope.dragon = $scope.dragonQueue.shift()
                // }
                //deal to me if I dont have three.
                console.log(`attempting to refresh a hand`);
                console.log($scope.me.tiles);
                if ($scope.me.tiles.length < 3 && $scope.me.canPlay) {

                    $scope.me.tiles = $scope.me.tiles.concat($scope.game.deal(1));

                    console.log('what is $scope.game.deck equal to', $scope.game.deck)
                    syncDeck();

                    firebasePlayersArr[$scope.meIdx].tiles = $scope.me.tiles;
                    firebasePlayersArr.$save($scope.meIdx);
                }
                console.log("deckArr and scope deck:", deckArr, $scope.game.deck);
                console.log(`dealt new card:`, $scope.me.tiles);
                //TODO: add dragon and dragonQueue changes locally
                // dragonRef.on('value', (arguments) => {})
            }

            if ($scope.me.uid !== $scope.game.currentPlayer.uid) {
                //we need to update the local version every time someone makes a space.. the local deck version is updated when someone makes a move
                $scope.game.deal(1);
                console.log($scope.game.deck);
            };

            //for multiple players
            if ($scope.me.uid === $scope.game.currentPlayer.uid && !$scope.gameOver) {
                gameRef.update({ "currentPlayerIndex": $scope.game.nextCanPlay() });
            }
        }
    });


    $scope.leaveGame = function() {
        console.log("i'm out");

        // remove the player from firebase
        firebasePlayersArr.$remove(firebasePlayersArr[$scope.meIdx]);

        $state.go('pickGame');
    };

    // TODO: need to remove this game room's moves from firebase?
    $scope.reset = function() {
        spaceObj.$remove();

        markersArr.$remove(0)
            .then(function(ref) {
                console.log("removed all markers", ref.key);
                markersArr.$add(gameFactory.markers);
            });

        deckArr.$remove(0)
            .then(function(ref) {
                console.log("removed the deck", ref.key);
                var tiles = gameFactory.tiles;
                var deck = new Deck(tiles).shuffle().tiles;
                deckArr.$add(deck);
            });

        gameRef.update({
            'currentPlayerIndex': 0
        })

        firebasePlayersArr.$loaded().then(function(data) {
            for (var i = 0; i < data.length; i++) {
                data[i].clicked = true;
                data[i].i = null;
                data[i].x = null;
                data[i].y = null;
                data[i].clicked = false;
                data[i].canPlay = null;
                data[i].marker = null;
                data[i].point = null;
                data[i].tiles = null;
                firebasePlayersArr.$save(i);
            }
        });


        $state.reload();
        console.log($scope.me);

    };

    function syncDeck() {
        console.log(`syncing deck`, deckArr);
        console.log(deckArr.length);
        console.log($scope.game.deck.tiles);

        if (deckArr.length) {
            deckArr[0] = $scope.game.deck.tiles;
            return deckArr.$save(0);
        } else {
            console.log($scope.game.deck.tiles);
            deckArr.$add($scope.game.deck.tiles);
        }
    }


    $scope.starttop = [
        [0, 0, 0],
        [0, 0, 1],
        [1, 0, 0],
        [1, 0, 1],
        [2, 0, 0],
        [2, 0, 1],
        [3, 0, 0],
        [3, 0, 1],
        [4, 0, 0],
        [4, 0, 1],
        [5, 0, 0],
        [5, 0, 1]
    ];
    $scope.startleft = [
        [0, 0, 7],
        [0, 0, 6],
        [0, 1, 7],
        [0, 1, 6],
        [0, 2, 7],
        [0, 2, 6],
        [0, 3, 7],
        [0, 3, 6],
        [0, 4, 7],
        [0, 4, 6],
        [0, 5, 7],
        [0, 5, 6]
    ];
    $scope.startbottom = [
        [0, 5, 5],
        [0, 5, 4],
        [1, 5, 5],
        [1, 5, 4],
        [2, 5, 5],
        [2, 5, 4],
        [3, 5, 5],
        [3, 5, 4],
        [4, 5, 5],
        [4, 5, 4],
        [5, 5, 5],
        [5, 5, 4]
    ];
    $scope.startright = [
        [5, 0, 2],
        [5, 0, 3],
        [5, 1, 2],
        [5, 1, 3],
        [5, 2, 2],
        [5, 2, 3],
        [5, 3, 2],
        [5, 3, 3],
        [5, 4, 2],
        [5, 4, 3],
        [5, 5, 2],
        [5, 5, 3]
    ];
});

tsuro.directive('tile', function() {
    return {
        templateUrl: 'browser/js/game/tile.directive.html',
        scope: {
            'thisTile': '=',
            'tryTile': '&tryTile',
            'rotateccw': '&rotateccw',
            'rotatecw': '&rotatecw',
            'place': '&place',
            'myTurn': '='
        }
    };
});