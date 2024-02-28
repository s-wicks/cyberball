import { Player } from './../models/player-model';
import { LeaveTrigger } from 'enums/leave-trigger';
import { SettingsModel } from './../models/settings-model';
import Phaser from 'phaser';
import { CpuSettingsModel } from 'models/cpu-settings-model';

const textStyle = { fontFamily: 'Arial', color: '#000000' };


export class CyberballScene extends Phaser.Scene {
    public settings: SettingsModel;

    // Game Objects:
    private player: Player;

    private ballSprite: Phaser.GameObjects.Sprite;
    private playerSprite: Phaser.GameObjects.Sprite;
    private playerGroup: Phaser.Physics.Arcade.Group;
    private cpuSprites: Phaser.GameObjects.Sprite[] = [];
    private timeLimitText: Phaser.GameObjects.Text;


    // Gameplay Mechanics:

    private playerHasBall = true;
    private ballHeld = true;
    private throwTarget: Phaser.GameObjects.Sprite;

    private activeTimeout;

    private absentPlayers: number[] = [];
    private showPlayerLeave: boolean = false;

    private gameEnded = false;

    // Stats:

    private throwCount = 0;

    private lastTime: number;
    private startTime: number;

    constructor(settings: SettingsModel) {
        super({});

        this.settings = settings;

        if(this.settings.useSchedule){

            this.settings.schedule = this.convertToMap(this.settings.scheduleText);

            //here for each value in this.settings.schedule run addRandomizationToScheduleText
            //and update this.settings.
            this.settings.schedule.forEach((value, key) => {
                this.settings.schedule.set(key, this.addRandomizationToScheduleNumbers(value));
            });
            console.log(this.settings.schedule)
        }
    }

    private addRandomizationToScheduleNumbers(input: number[]): number[] {
        // This array will hold the final sequence of numbers
        let newSchedule: number[] = [];

        // Iterate over each element in the input array
        input.forEach(number => {
            if (number > 9) {
                // Convert the number to a string to get individual digits
                let digits = number.toString().split('');
                // Shuffle the digits randomly
                for (let i = digits.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [digits[i], digits[j]] = [digits[j], digits[i]]; // ES6 array destructuring swap
                }
                // Convert each digit back to a number and add to the new schedule
                digits.forEach(digit => newSchedule.push(parseInt(digit)));
            } else {
                // If the number is a single digit, just add it to the new schedule
                newSchedule.push(number);
            }
        });
        //number of schdules != number of cpus && number in each exists as a cpu index
        //throw delay
        //errrrors messages
        //timing


        // Return the new array of numbers
        return newSchedule;
    }








    private convertToMap(str: string): Map<number, number[]> {
        const lines = str.split('\n');
        const map = new Map<number, number[]>();

        for (const line of lines) {
          const [key, ...values] = line.split(',').map(Number);
          map.set(key, values);
        }

        return map;
      }

    public preload() {
        this.load.crossOrigin = 'anonymous';

        // TODO: Load from settings.
        this.load.image('ball', `${this.settings.baseUrl}/${this.settings.ballSprite}`);
        this.load.multiatlas('player', `${this.settings.baseUrl}/player.json`, 'assets');

        if(this.settings.player.portraitBuff){
            let data = new Image();

            // data.src = this.settings.player.portraitBuff as string;

            this.textures.addBase64('playerPortrait', this.settings.player.portraitBuff);
            // this.load.image('playerPortrait', 'https://cors-anywhere.herokuapp.com/' + this.settings.player.portrait);

        }

        this.settings.computerPlayers.forEach((cpu, i) => {
            if(cpu.portraitBuff){
                this.textures.addBase64('cpuPortrait' + i, cpu.portraitBuff);
            }
                // this.load.image('cpuPortrait' + i, 'https://cors-anywhere.herokuapp.com/' + cpu.portrait);
        });
    }

    public create() {
        this.cameras.main.setBackgroundColor('#ffffff');

        // Animations:

        this.anims.create({
            key: 'active',
            frames: this.anims.generateFrameNames('player', { start: 1, end: 1, prefix: 'active/', suffix: '.png' })
        });

        this.anims.create({
            key: 'idle',
            frames: this.anims.generateFrameNames('player', { start: 1, end: 1, prefix: 'idle/', suffix: '.png' })
        });

        this.anims.create({
            key: 'throw',
            frameRate: 12,
            frames: this.anims.generateFrameNames('player', { start: 1, end: 3, prefix: 'throw/', suffix: '.png' })
        });

        this.anims.create({
            key: 'catch',
            frames: this.anims.generateFrameNames('player', { start: 1, end: 1, prefix: 'catch/', suffix: '.png' })
        });

        // Player:

        let playerPosition = this.getPlayerPosition();

        this.playerGroup = this.physics.add.group({ immovable: true, allowGravity: false });
        this.playerSprite = this.playerGroup.create(playerPosition.x, playerPosition.y, 'player', 'active/1.png');
        this.playerSprite.setData('settings', this.settings.player);

        if(this.settings.player.tint)
            this.playerSprite.setTint(parseInt(this.settings.player.tint.substr(1), 16));

        this.playerSprite.setData('name-object', this.add.text(playerPosition.x, playerPosition.y + this.playerSprite.height / 2 + 10, this.settings.player.name, textStyle).setOrigin(0.5));

        if(this.settings.player.portrait) {
            var portraitPosition = this.getPlayerPortraitPosition(this.playerSprite);
            var image = this.add.image(portraitPosition.x, portraitPosition.y, 'playerPortrait');

            image.setScale(this.settings.portraitHeight / image.height);
        }

        if((this.settings.player.leaveTrigger & LeaveTrigger.Time) === LeaveTrigger.Time) {
            this.playerSprite.setData('leaveTime', Date.now() + this.getVariantValue(this.settings.player.leaveTime, this.settings.player.leaveTimeVariance) * 1000);
        }

        if((this.settings.player.leaveTrigger & LeaveTrigger.TimeIgnored) === LeaveTrigger.TimeIgnored) {
            this.playerSprite.setData('leaveTimeIgnored', Date.now() + this.getVariantValue(this.settings.player.leaveTimeIgnored, this.settings.player.leaveTimeIgnoredVariance) * 1000);
        }



        // CPU:

        for (let i = 0; i < this.settings.computerPlayers.length; i++) {
            let cpuPosition = this.getCPUPosition(i);
            let cpuSprite: Phaser.GameObjects.Sprite = this.playerGroup.create(cpuPosition.x, cpuPosition.y, 'player', 'idle/1.png');



            cpuSprite.setData('name-object', this.add.text(cpuPosition.x, cpuPosition.y + cpuSprite.height / 2 + 10, this.settings.computerPlayers[i].name, textStyle).setOrigin(0.5));

            if(this.settings.computerPlayers[i].portrait) {
                var portraitPosition = this.getCPUPortraitPosition(i, cpuSprite);
                var image = this.add.image(portraitPosition.x, portraitPosition.y, 'cpuPortrait' + i);

                image.setScale(this.settings.portraitHeight / image.height);
            }

            cpuSprite.flipX = cpuPosition.x > this.playerSprite.x;
            cpuSprite.setData('settings', this.settings.computerPlayers[i]);

            if(this.settings.computerPlayers[i].tint)
                cpuSprite.setTint(parseInt(this.settings.computerPlayers[i].tint.substr(1), 16));

            cpuSprite.setInteractive();
            cpuSprite.on('pointerdown', (e) => {
                if (this.playerHasBall) {


                    // Ensure player and ball are facing the correct way on touch devices:
                    this.playerSprite.flipX = this.input.x < this.playerSprite.x;

                    let ballPosition = this.getActiveBallPosition(this.playerSprite);
                    this.ballSprite.x = ballPosition.x;
                    this.ballSprite.y = ballPosition.y;

                    this.throwBall(this.playerSprite, cpuSprite);
                }
            });

            if((this.settings.computerPlayers[i].leaveTrigger & LeaveTrigger.Time) === LeaveTrigger.Time) {
                cpuSprite.setData('leaveTime', Date.now() + this.getVariantValue(this.settings.computerPlayers[i].leaveTime, this.settings.computerPlayers[i].leaveTimeVariance) * 1000);
            }

            if((this.settings.computerPlayers[i].leaveTrigger & LeaveTrigger.TimeIgnored) === LeaveTrigger.TimeIgnored) {
                cpuSprite.setData('leaveTimeIgnored', Date.now() + this.getVariantValue(this.settings.computerPlayers[i].leaveTimeIgnored, this.settings.computerPlayers[i].leaveTimeIgnoredVariance) * 1000);
            }

            this.cpuSprites.push(cpuSprite);
        }
        if (this.settings.useSchedule ) {

            if(this.settings.changeColor){
                this.cpuSprites.forEach(cpu => {
                    cpu.tint = 0xff0000;
                });
                this.playerSprite.tint = 0xff0000;
                if (this.playerHasBall) {
                    this.playerSprite.tint = 0x00ff00;
                }
                const playerId = 1;
                let scheduleQueue  = this.settings.schedule.get(playerId);

                let nextRand = 0;
                if(scheduleQueue && scheduleQueue.length > 0){
                    nextRand = scheduleQueue[0];
                }else{
                    //throw an error
                }

                let joinedPlayers = playerId + String(nextRand);

                const digits = Array.from(String(joinedPlayers), Number);

                digits.forEach(id => {
                    let sprite = this.playerGroup.getChildren()[id-1] as Phaser.GameObjects.Sprite;
                    sprite.tint = 0x00ff00;
                });
            }

        }

        // Ball:

        let ballPosition = this.getActiveBallPosition(this.playerSprite);
        this.ballSprite = this.physics.add.sprite(ballPosition.x, ballPosition.y, 'ball');

        if(this.settings.ballTint)
            this.ballSprite.setTint(parseInt(this.settings.ballTint.substr(1), 16));

        this.physics.add.overlap(this.ballSprite, this.playerGroup, (_b, receiver) => {
            if (!this.ballHeld && receiver === this.throwTarget)
                this.catchBall(receiver as Phaser.GameObjects.Sprite);
        });

        // Time Limit:

        this.startTime = Date.now();
        this.lastTime = this.startTime;

        if (this.settings.timeLimit > 0 && this.settings.displayTimeLimit) {
            this.timeLimitText = this.add.text(this.sys.canvas.width - 10, 10, this.getTimeString(), textStyle);
            this.timeLimitText.setOrigin(1, 0);
        }

    }

    public update() {
        //checks game ending conditions
        //All CPUs left
        if (this.settings.selectedGameOverCondition === "allCPUsLeft" && this.absentPlayers.length >= this.settings.computerPlayers.length) {
            if(!this.gameEnded) this.postEvent('All CPUs left');
            this.gameOver();
            return;
        }
        // The game ends at the end of the schedule or when reaching the throw count. Check is done in catchBall to make sure game ends when a player is holding the ball.

        //Time limit
        if (this.settings.selectedGameOverCondition === "timeLimit" && this.settings.timeLimit > 0 && Date.now() - this.startTime > this.settings.timeLimit) {
            if(!this.gameEnded) this.postEvent('global-time-limit');
            this.gameOver();
        }


        if(this.gameEnded)
            return;

        if (this.playerHasBall) {
            this.playerSprite.play('active');
            this.playerSprite.flipX = this.input.x < this.playerSprite.x;

            let ballPosition = this.getActiveBallPosition(this.playerSprite);
            this.ballSprite.x = ballPosition.x;
            this.ballSprite.y = ballPosition.y;
        } else if (!this.ballHeld) {
            // Eyes on the ball:
            this.playerGroup.getChildren().forEach(c => {
                let sprite = c as Phaser.GameObjects.Sprite;
                if (sprite.frame.name.includes('idle'))
                    sprite.flipX = this.ballSprite.x < sprite.x
            });
        }

        // Player may leave after time has passed:

        if(!this.showPlayerLeave && (this.settings.player.leaveTrigger & LeaveTrigger.Time) === LeaveTrigger.Time &&
                Date.now() > this.playerSprite.getData('leaveTime')) {
            this.showPlayerLeave = true;
            this.postEvent('player-may-leave', {
                reason: 'time elapsed'
            });
        }
        // Player may leave after ignored for a time:
        else if (!this.playerHasBall && !this.showPlayerLeave && (this.settings.player.leaveTrigger & LeaveTrigger.TimeIgnored) === LeaveTrigger.TimeIgnored &&
                    Date.now() > this.playerSprite.getData('leaveTimeIgnored')) {
            this.showPlayerLeave = true;
            this.postEvent('player-may-leave', {
                reason: 'time ignored'
            });
        }

        this.cpuSprites.forEach(cpu => {
            // CPU shouldn't leave if they:
            //  - have the ball or are about to catch the ball
            //  - have already left
            if (cpu == this.throwTarget || cpu.getData('absent'))
                return;

            let settings = cpu.getData('settings') as CpuSettingsModel;

            // CPU may leave after some time
            if((settings.leaveTrigger & LeaveTrigger.Time) === LeaveTrigger.Time &&
                    Date.now() > cpu.getData('leaveTime')) {
                this.leaveGame(cpu, 'time elapsed');
            }
            // CPU may leave after ignored for a time:
            else if ((settings.leaveTrigger & LeaveTrigger.TimeIgnored) === LeaveTrigger.TimeIgnored &&
                    Date.now() > cpu.getData('leaveTimeIgnored')) {
                this.leaveGame(cpu, 'time ignored');
            }
        });

        // Time Limit:

        if (this.settings.timeLimit > 0 && this.settings.displayTimeLimit)
            this.timeLimitText.setText(this.getTimeString());

        // if (this.settings.timeLimit > 0 && Date.now() - this.startTime > this.settings.timeLimit) {
        //     this.postEvent('global-time-limit');
        //     this.gameOver();
        // }
    }

    public gameOver() {
        if (this.gameEnded)
            return;

        this.gameEnded = true;

        this.postEvent('game-end');

        // Stop future throws:
        clearTimeout(this.activeTimeout);
        // @ts-ignore
        this.playerGroup.children.each(child => child.removeAllListeners());

        // Draw game over screen:
        this.add.rectangle(this.sys.canvas.width / 2, this.sys.canvas.height / 2, this.sys.canvas.width, this.sys.canvas.height, 0xdddddd, this.settings.gameOverOpacity);
        this.add.text(this.sys.canvas.width / 2, this.sys.canvas.height / 2, this.settings.gameOverText, textStyle).setOrigin(0.5);
    }

    // Mechanics:

    public throwBall(thrower: Phaser.GameObjects.Sprite, receiver: Phaser.GameObjects.Sprite) {
        this.postEvent('throw', {
            thrower: thrower.getData('settings').name,
            receiver: receiver.getData('settings').name,
            wait: Date.now() - this.lastTime
        });

        this.lastTime = Date.now();

        // Update trackers:

        // Wait until the player throws the ball to reset their ignored timer, so they cannot ignore themselves.
        let throwerSettings = thrower.getData('settings');
        if((throwerSettings.leaveTrigger & LeaveTrigger.TimeIgnored) === LeaveTrigger.TimeIgnored) {
            receiver.setData('leaveTimeIgnored', Date.now() + this.getVariantValue(throwerSettings.leaveTimeIgnored, throwerSettings.leaveTimeIgnoredVariance) * 1000);
        }

        this.playerHasBall = this.ballHeld = false;
        this.throwTarget = receiver;

        this.throwCount++;

        // Player animation:

        thrower.play('throw');
        thrower.playAfterRepeat('idle');

        // Ball physics:

        let ballTargetPosition = this.getCaughtBallPosition(receiver);
        this.physics.moveTo(this.ballSprite, ballTargetPosition.x, ballTargetPosition.y, this.settings.ballSpeed);
    }

    private getRandomDigit(number: number): number {
        const digits = Array.from(String(number), Number);

        const randomIndex = Math.floor(Math.random() * digits.length);

        return digits[randomIndex] - 1;
      }

    public catchBall(receiver: Phaser.GameObjects.Sprite) {


        // Update trackers:

        this.ballHeld = true;
        receiver.setData('throwsIgnored', 0)

        // Player animation:

        receiver.play('catch');

        // Ball physics:

        let ballPosition = this.getCaughtBallPosition(receiver);
        (this.ballSprite.body as Phaser.Physics.Arcade.Body).reset(ballPosition.x, ballPosition.y);

        // Check for leavers:

        // Player may leave after a number of turns:
        if(!this.showPlayerLeave && (this.settings.player.leaveTrigger & LeaveTrigger.Turn) === LeaveTrigger.Turn) {
            let leaveThrows = this.getVariantValue(this.settings.player.leaveTurn, this.settings.player.leaveTurnVariance);

            if (this.throwCount >= leaveThrows) {
                this.showPlayerLeave = true;
                this.postEvent('player-may-leave', {
                    reason: 'throws elapsed'
                });
            }
        }
        // Player may leave after ignored for a number of turns:
        else if(!this.showPlayerLeave && (this.settings.player.leaveTrigger & LeaveTrigger.Ignored) === LeaveTrigger.Ignored) {
            let leaveThrows = this.getVariantValue(this.settings.player.leaveIgnored, this.settings.player.leaveIgnoredVariance);
            let playerThrowsIgnored = this.playerSprite.getData('throwsIgnored') ?? 0;

            if(this.playerSprite != receiver)
                this.playerSprite.setData('throwsIgnored', ++playerThrowsIgnored);

            if (playerThrowsIgnored >= leaveThrows) {
                this.showPlayerLeave = true;
                this.postEvent('player-may-leave', {
                    reason: 'throws ignored'
                });
            }
        }

        this.cpuSprites.forEach(cpu => {
            // CPU shouldn't leave if they:
            //  - have the ball
            //  - have already left
            if (cpu == receiver || cpu.getData('absent'))
                return;

            let settings = cpu.getData('settings') as CpuSettingsModel;
            let throwsIgnored = (cpu.getData('throwsIgnored') ?? 0) + 1;
            cpu.setData('throwsIgnored', throwsIgnored);

            // CPU may leave after a number of turns:
            if((settings.leaveTrigger & LeaveTrigger.Turn) === LeaveTrigger.Turn) {
                let leaveThrows = this.getVariantValue(settings.leaveTurn, settings.leaveTurnVariance);

                if (this.throwCount >= leaveThrows && this.checkChance(settings.leaveTurnChance))
                    this.leaveGame(cpu, 'throws elapsed');
            }
            // CPU may leave after ignored for a number of turns:
            else if((settings.leaveTrigger & LeaveTrigger.Ignored) === LeaveTrigger.Ignored) {
                let leaveThrows = this.getVariantValue(settings.leaveIgnored, settings.leaveIgnoredVariance);

                if (throwsIgnored >= leaveThrows && this.checkChance(settings.leaveIgnoredChance))
                    this.leaveGame(cpu, 'throws ignored');
            }
        });

        // // The game ends at the end of the schedule or when reaching the throw count.

        if (
            this.settings.selectedGameOverCondition === "throwCount" &&
            ((this.settings.useSchedule && this.settings.scheduleHonorsThrowCount && this.throwCount >= this.settings.throwCount) ||
            (!this.settings.useSchedule && this.throwCount >= this.settings.throwCount))
        ) {
            this.postEvent('throw-count-met');
            this.gameOver();
            return;
        }

        // Prepare for next throw:

        if (receiver === this.playerSprite) {
            this.playerHasBall = true;
        } else {
            let settings = receiver.getData('settings') as CpuSettingsModel;

            this.activeTimeout = setTimeout(() => {
                receiver.play('active');

                ballPosition = this.getActiveBallPosition(receiver);
                this.ballSprite.x = ballPosition.x;
                this.ballSprite.y = ballPosition.y;
                let id = this.playerGroup.getChildren().indexOf(receiver);

                this.activeTimeout = setTimeout(() => {

                    if (this.settings.useSchedule ) {
                        let scheduleQueue  = this.settings.schedule.get(id + 1);

                        let nextRand = 0;
                        if(scheduleQueue && scheduleQueue.length > 0){
                            nextRand = scheduleQueue[0];
                        }else{
                            this.postEvent('throw-count-met');
                            this.gameOver();
                            return;
                            // const scheduleMap = this.convertToMap(this.settings.scheduleText);
                            // this.settings.schedule.set(id, scheduleMap.get(id));
                        }

                        if(this.settings.changeColor){
                            this.cpuSprites.forEach(cpu => {
                                cpu.tint = 0xff0000;
                            });
                            this.playerSprite.tint = 0xff0000;

                            let joinedPlayers = id + String(nextRand);

                            const digits = Array.from(String(joinedPlayers), Number);
                            console.log('joinedPlayers', digits);
                            digits.forEach(id => {
                                let sprite = this.playerGroup.getChildren()[id-1] as Phaser.GameObjects.Sprite;
                                sprite.tint = 0x00ff00;
                            });
                        }

                        let next = this.getRandomDigit(nextRand);
                        if(next == 0){
                            console.log("next is the player....")
                        }

                        // Skip self and absent players in schedule.
                        while(next === this.playerGroup.getChildren().indexOf(receiver) &&
                            !this.absentPlayers.includes(next)){
                            //this.scheduleIndex++;
                            if(scheduleQueue.length > 0){
                                const tmpRand = scheduleQueue.shift();
                                if(tmpRand){
                                    next = this.getRandomDigit(tmpRand);
                                }else{
                                    next = 0;
                                    break;
                                }
                            }else{
                                next = 0;
                                break;
                            }

                        }

                        this.throwBall(receiver, this.playerGroup.getChildren()[next] as Phaser.GameObjects.Sprite)


                        // show current player
                        // this.currentIndex = next;
                        // if(this.currentIndex ===0){
                        //     this.currentIndexText.setText(`current player: You`);
                        // }
                        // else{
                        //     this.currentIndexText.setText(`current player: ${this.settings.computerPlayers[this.currentIndex-1].name}`);
                        //     //seperate because dont know next one is player or cpu
                        // }
                        scheduleQueue.shift();
                        // if(scheduleQueue == undefined || scheduleQueue.length == 0){
                        //     const scheduleMap = this.convertToMap(this.settings.scheduleText);

                        //     this.settings.schedule.set(id,scheduleMap.get(id));

                        // }else{
                        //     this.settings.schedule.set(id,scheduleQueue);
                        // }

                        // if(scheduleQueue.length > 0){
                        //     this.scheduleIndex = this.getRandomDigit(scheduleQueue[0]);
                        // }else{
                        //     this.scheduleIndex = 0;

                        // }

                        // // show next player
                        // if(this.scheduleIndex===0){
                        //     this.scheduleIndexText.setText(`next player: You`);
                        // }
                        // else{
                        //     this.scheduleIndexText.setText(`next player: ${this.settings.computerPlayers[this.scheduleIndex-1].name}`);
                        // }



                    } else {
                        let random = Math.random() * 100;

                        // A psuedo-random target is selected by subtracting the target preference chance from the random number until 0 is reached
                        for (var i = 0; i < settings.targetPreference.length; i++) {
                            random -= settings.targetPreference[i];

                            if (random <= 0) {
                                // Exclude self
                                if (i >= this.playerGroup.getChildren().indexOf(receiver))
                                    i++

                                this.throwBall(receiver, this.playerGroup.getChildren()[i] as Phaser.GameObjects.Sprite);

                                break;
                            }
                        }
                    }
                }, this.getVariantValue(settings.throwDelay, settings.throwDelayVariance));
            }, this.getVariantValue(settings.catchDelay, settings.catchDelayVariance))
        }
    }

    public leaveGame(player: Phaser.GameObjects.Sprite, reason: string = '') {
        let nameObject = player.getData('name-object') as Phaser.GameObjects.Text;
        let playerIndex = this.playerGroup.getChildren().indexOf(player);

        this.absentPlayers.push(playerIndex);
        player.setData('absent', true);

        nameObject.setText([nameObject.text, 'has left the game.']);

        // Deactivate player object

        player.removeAllListeners();
        player.setVisible(false);

        this.postEvent('leave', {
            leaver: player.getData('settings').name,
            reason: reason
        });

        // Redistribute throw target weights:

        console.log('pindex', playerIndex);

        this.settings.computerPlayers.forEach((cpu, i) => {
            if(this.absentPlayers.includes(i + 1))
                return;

            console.log('distribute before', i, cpu.targetPreference);

            let targetIndex = playerIndex > (i + 1) ? playerIndex - 1 : playerIndex;
            let targetWeight = cpu.targetPreference[targetIndex];
            cpu.targetPreference[targetIndex] = 0;
            let total = cpu.targetPreference.reduce((acc, cur) => acc + cur);

            for(let k = 0; k < cpu.targetPreference.length; k++) {
                if (cpu.targetPreference[k] == 0)
                    continue;

                cpu.targetPreference[k] += cpu.targetPreference[k] / total * targetWeight;
            }

            console.log('distribute after', i, cpu.targetPreference);
        });

        // If there is only one player left, end the game:


        // Check if this triggers other players leaving:

        if(!this.showPlayerLeave && (this.settings.player.leaveTrigger & LeaveTrigger.OtherLeaver) === LeaveTrigger.OtherLeaver) {
            console.log(this.absentPlayers.length, this.settings.player.leaveOtherLeaver);
            if (this.absentPlayers.length >= this.settings.player.leaveOtherLeaver) {
                this.showPlayerLeave = true;
                this.postEvent('player-may-leave', {
                    reason: 'other leavers'
                });
            }
        }

        this.cpuSprites.forEach(cpu => {
            let settings = cpu.getData('settings') as CpuSettingsModel;

            // CPU shouldn't leave if they:
            //  - have the ball
            //  - have already left
            if (cpu == this.throwTarget || cpu.getData('absent'))
                return;

            if((settings.leaveTrigger & LeaveTrigger.OtherLeaver) === LeaveTrigger.OtherLeaver) {
                if (this.absentPlayers.length >= settings.leaveOtherLeaver && this.checkChance(settings.leaveOtherLeaverChance))
                    this.leaveGame(cpu, 'other leavers');
            }
        });
    }

    // Helpers:

    getCPUPosition(i: number): Phaser.Geom.Point {
        // TODO: Increase padding when portaits are enabled.
        let padding = 75;
        let extraPadding = this.settings.hasPortraits ? this.settings.portraitHeight + this.settings.portraitPadding * 2 : 0;

        if(this.settings.computerPlayers.length === 1) {
            return new Phaser.Geom.Point(
                this.sys.canvas.width / 2,
                padding + extraPadding
            );
        }

        return new Phaser.Geom.Point(
            // Evenly divide the width of the screen by the number of players.
            ((this.sys.canvas.width - (padding * 2)) / (this.settings.computerPlayers.length - 1)) * i + padding,
            // First and last player are closer in the middle, others stand along the edge.
            i === 0 || i === this.settings.computerPlayers.length - 1
                ? (this.sys.canvas.height / 2)
                : padding + extraPadding
        );
    }

    getCPUPortraitPosition(i: number, sprite: Phaser.GameObjects.Sprite): Phaser.Geom.Point  {
        let position = this.getCPUPosition(i);

        return new Phaser.Geom.Point(
            position.x,
            position.y - this.settings.portraitHeight + this.settings.portraitPadding * 2 - sprite.height / 2
        );
    }

    getPlayerPosition(): Phaser.Geom.Point {
        let padding = 75;

        if(this.settings.hasPortraits)
            padding += this.settings.portraitHeight + this.settings.portraitPadding * 2;

        return new Phaser.Geom.Point(
            this.sys.canvas.width / 2,
            this.sys.canvas.height - padding
        );
    }

    getPlayerPortraitPosition(sprite: Phaser.GameObjects.Sprite): Phaser.Geom.Point {
        var position = this.getPlayerPosition();

        return new Phaser.Geom.Point(
            position.x,
            position.y + this.settings.portraitHeight / 2 + this.settings.portraitPadding * 2 + sprite.height / 2 + 10
        );
    }

    // TODO: This is invalid if the sprites are changed.
    getCaughtBallPosition(target: Phaser.GameObjects.Sprite) {
        return new Phaser.Geom.Point(target.x + (target.flipX ? -50 : 50), target.y - 15);
    }

    // TODO: This is invalid if the sprites are changed.
    getActiveBallPosition(target: Phaser.GameObjects.Sprite) {
        return new Phaser.Geom.Point(target.x + (target.flipX ? 40 : -40), target.y - 20);
    }

    getVariantValue(base: number, variance: number): number {
        return base + (Phaser.Math.RND.between(0, variance) * Phaser.Math.RND.sign());
    }

    checkChance(chance: number): boolean {
        return Phaser.Math.RND.between(0, 100) <= chance;
    }

    getTimeString(): string {
        let timeRemaining = this.settings.timeLimit - (Date.now() - this.startTime);
        let time = new Date(timeRemaining < 0 ? 0 : timeRemaining);

        return `${this.settings.timeLimitText} ${time.getUTCMinutes()}:${time.getUTCSeconds() < 10 ? '0' : ''}${time.getUTCSeconds()}`;
    }

    postEvent(type: string, data: any = {}): void {
        console.log('post event: ' + type, data);

        window.parent.postMessage({
            type: type,
            ...data
        }, '*');
    }
}
