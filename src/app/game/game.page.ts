import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular/standalone';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { App } from '@capacitor/app';
import { AlertController } from '@ionic/angular';
import { Howl } from 'howler';

@Component({
  selector: 'app-game',
  templateUrl: 'game.page.html',
  styleUrls: ['game.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, HttpClientModule],
})
export class GamePage implements OnInit, AfterViewInit {
  @ViewChild('gameCanvas', { static: false }) canvasRef!: ElementRef;
  questions: any[] = [];

  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;

  highScore = 0;
  score = 0;
  consecutiveCorrect = 0;
  questionStartTime = 0;
  nextQuestionAt: number | null = null;
  questionTimeout = 5000;

  SPEED = 0.3;
  GRAVITY = 0.5;
  FRICTION = 0.98;
  TERRAIN_AMPLITUDE = 80;
  CONTACT_THRESHOLD = 0;

  paused = true;
  gameOver = false;
  quizReady = false;

  cliff: any = null;
  bridgeShownFor: any = null;

  vehicle: any = {
    x: 0,
    y: 0,
    vx: this.SPEED,
    vy: 0,
    angle: 0,
    width: 50,
    height: 25,
    wheelBase: 25,
    wheelRadius: 10
  };
  soundBg = new Howl({
    src: ['assets/audio/background.mp3'],
    loop: true,
    volume: 0.2
  });
  soundCorrectAnswer = new Howl({
    src: ['assets/audio/correct-answer.mp3'],
    loop: false,
    volume: 0.4,
    autoplay: false
  });
  soundWrongAnswer = new Howl({
    src: ['assets/audio/wrong-answer.mp3'],
    loop: false,
    volume: 0.4,
    autoplay: false
  });
  soundFalling = new Howl({
    src: ['assets/audio/falling.mp3'],
    loop: false,
    volume: 0.4,
    autoplay: false
  });
  soundGameOver = new Howl({
    src: ['assets/audio/game-over.mp3'],
    loop: false,
    volume: 0.4,
    autoplay: false
  });
  soundEngineStart = new Howl({
    src: ['assets/audio/engine-start.mp3'],
    loop: false,
    volume: 0.4,
    autoplay: false
  });
  soundGo = new Howl({
    src: ['assets/audio/go.mp3'],
    loop: false,
    volume: 0.4,
    autoplay: false
  });
  soundStartPause = new Howl({
    src: ['assets/audio/start-pause.mp3'],
    loop: false,
    volume: 1,
    autoplay: false
  });
  soundNextQuestion = new Howl({
    src: ['assets/audio/next-question.mp3'],
    loop: false,
    volume: 1,
    autoplay: false
  });
  constructor(private http: HttpClient) {

  }

  ngOnInit(): void {
    App.addListener('pause', () => {
      if (this.soundBg.playing()) {
        this.soundBg.stop();
      }
      this.pauseGame();
    });

    App.addListener('resume', () => {
      if (!this.soundBg.playing()) {
        this.soundBg.play();
      }
    });

    if (!this.soundBg.playing()) {
      this.soundBg.play();
    }
    document.addEventListener("backbutton", async (e) => {
      e.preventDefault(); // Prevent default back action

      if (!this.paused && !this.gameOver) {
        this.pauseGame();
      } else {
        const confirmExit = confirm("Are you sure you want to exit the game?");
        if (confirmExit) {
          this.soundBg.stop();
          await App.exitApp();
        }
      }
    }, false);
  }

  async ngAfterViewInit() {
    window.addEventListener("resize", () => { this.resizeCanvas() });
    window.addEventListener("orientationchange", () => { this.resizeCanvas() });

    await this.lockLandscapeIfMobile();
    await this.loadQuestions();

    // Wait for canvas to be present in DOM and visible
    await this.waitForCanvasReady();

    this.canvas = this.canvasRef.nativeElement;
    this.resizeCanvas(); // initial
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    this.initVehicleY();
    this.setHighScore(
      localStorage.getItem('highScore') ? +localStorage.getItem('highScore')! : 0
    );
    this.setScore(0);

    this.loop();

    const navHeight = this.getNavigationBarHeight();
    if (navHeight > 0) {
      const pauseBtn = document.getElementById("pauseBtn");
      pauseBtn!.style.marginRight = `${navHeight + 10}px`;
    }
  }

  getNavigationBarHeight(): number {
    const screenHeight = window.screen.height;
    const innerHeight = window.innerHeight;
    const navBarHeight = screenHeight - innerHeight;

    return navBarHeight > 0 ? navBarHeight : 0;
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private waitForCanvasReady(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        const canvas = this.canvasRef?.nativeElement;
        if (canvas && canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  async lockLandscapeIfMobile() {
    const info = await Device.getInfo();

    const isMobile = info.platform === 'ios' || info.platform === 'android';
    const isNative = Capacitor.isNativePlatform();

    if (isMobile && isNative) {
      try {
        await ScreenOrientation.lock({ orientation: 'landscape' });
        console.log('🔒 Screen locked to landscape');
      } catch (err) {
        console.warn('⚠️ Failed to lock screen orientation:', err);
      }
    } else {
      console.log('💻 Skipping orientation lock (not native mobile)');
    }
  }

  async loadQuestions() {
    const data: any = await this.http.get<any[]>('assets/questions.json').toPromise();
    this.questions = data.map((q: any) => ({ ...q, done: false }));
  }

  initVehicleY() {
    const frontX = this.vehicle.x + this.vehicle.wheelBase / 2;
    const backX = this.vehicle.x - this.vehicle.wheelBase / 2;
    const frontY = this.getTerrainY(frontX);
    const backY = this.getTerrainY(backX);
    const avgY = (frontY + backY) / 2;
    this.vehicle.y = avgY - this.vehicle.wheelRadius - this.vehicle.height / 2;
  }

  startGame() {
    this.soundStartPause.play();
    this.paused = false;
    this.gameOver = false;
    document.getElementById('startBtn')!.style.display = 'none';
    document.getElementById('pauseBtn')!.style.display = 'block';
    if (!this.cliff) {
      this.nextQuestionAt = Date.now() + 5000;
    } else if (this.quizReady) {
      document.getElementById('quizContainer')!.style.display = 'block';
    }
    if (document.getElementById('startBtn')?.innerText === "Start Game" || document.getElementById('startBtn')?.innerText === "Play Again") {
      setTimeout(() => {
        this.soundGo.play();
        this.soundEngineStart.play();
      }, 500);
    }
  }

  pauseGame() {
    this.soundStartPause.play();
    this.paused = true;
    document.getElementById('pauseBtn')!.style.display = 'none';
    const startBtn = document.getElementById('startBtn')!;
    startBtn.style.display = 'block';
    startBtn.innerText = 'Resume Game';
    document.getElementById('quizContainer')!.style.display = 'none';
  }

  getRandomQuestion() {
    const available = this.questions.filter(q => !q.done);
    if (available.length === 0) {
      this.gameOver = true;
      document.getElementById('quizContainer')!.style.display = 'none';
      document.getElementById('pauseBtn')!.style.display = 'none';
      setTimeout(() => this.resetGame(), 5000);
      return null;
    }
    const idx = Math.floor(Math.random() * available.length);
    const question = available[idx];
    this.questions = this.questions.map(q => q.id === question.id ? { ...q, done: true } : q);
    return question;
  }

  showQuestion() {
    if (this.paused || this.gameOver) return;
    const question = this.getRandomQuestion();
    if (!question) return;
    this.soundNextQuestion.play();
    const quizContainer = document.getElementById('quizContainer')!;
    const questionText = document.getElementById('questionText')!;
    const choicesContainer = document.getElementById('choicesContainer')!;

    quizContainer.style.display = 'block';
    questionText.textContent = question.question;
    choicesContainer.innerHTML = '';
    this.quizReady = true;
    this.questionStartTime = Date.now();

    question.choices.forEach((choice: string, idx: number) => {
      const btn = document.createElement('div');
      btn.className = 'choice';
      btn.textContent = choice;
      btn.onclick = () => this.handleAnswer(idx, question);
      choicesContainer.appendChild(btn);
    });
  }

  handleAnswer(idx: number, question: any) {
    if (!this.quizReady) return;
    this.quizReady = false;
    const timeTaken = Date.now() - this.questionStartTime;

    if (idx === question.correct) {
      document.getElementById('quizContainer')!.style.display = 'none';
      this.cliff.bridgeShown = true;

      this.SPEED += 0.1;
      this.vehicle.height *= 0.99;
      this.vehicle.width *= 0.99;
      this.vehicle.wheelBase *= 0.99;
      this.vehicle.wheelRadius *= 0.99;
      this.questionTimeout *= 0.995;

      let points = 100;
      if (this.SPEED > 0.5) points += 10;
      if (timeTaken < 2000) points += 50;
      this.consecutiveCorrect++;
      if (this.consecutiveCorrect % 3 === 0) points += 50;
      this.updateScore(points);
      this.nextQuestionAt = Date.now() + this.questionTimeout;
      this.soundCorrectAnswer.play();
    } else {
      document.getElementById('quizContainer')!.style.display = 'none';
      document.getElementById('pauseBtn')!.style.display = 'none';
      this.SPEED = 5;
      this.updateScore(-50);
      this.consecutiveCorrect = 0;
      this.soundWrongAnswer.play();
    }
  }

  getTerrainY(x: number): number {
    if (this.cliff && x > this.cliff.x && x < this.cliff.x + this.cliff.width && !this.cliff.bridgeShown) {
      return this.canvas.height + 1000;
    }
    return this.canvas.height - 120 - Math.sin(x * 0.005) * this.TERRAIN_AMPLITUDE - Math.cos(x * 0.02) * 30;
  }

  spawnCliff() {
    this.cliff = {
      x: this.vehicle.x + this.canvas.width,
      width: 400,
      active: true,
      bridgeShown: false,
      scheduledNext: false
    };
    this.bridgeShownFor = null;
  }

  updateVehicle() {
    this.vehicle.vy += this.GRAVITY;
    const frontX = this.vehicle.x + this.vehicle.wheelBase / 2;
    const backX = this.vehicle.x - this.vehicle.wheelBase / 2;
    const frontY = this.getTerrainY(frontX);
    const backY = this.getTerrainY(backX);
    const dx = frontX - backX;
    const dy = frontY - backY;
    const slopeAngle = Math.atan2(dy, dx);

    this.vehicle.vx += this.SPEED * Math.cos(slopeAngle) * 0.1;
    this.vehicle.vy -= this.SPEED * Math.sin(slopeAngle) * 0.1;

    this.vehicle.vx *= this.FRICTION;
    this.vehicle.vy *= this.FRICTION;

    this.vehicle.x += this.vehicle.vx;
    this.vehicle.y += this.vehicle.vy;

    const expectedY = (frontY + backY) / 2 - this.vehicle.wheelRadius - this.vehicle.height / 2;
    const belowGround = this.vehicle.y > expectedY + this.CONTACT_THRESHOLD;
    const aboveGround = this.vehicle.y < expectedY - this.CONTACT_THRESHOLD;

    if (!aboveGround && belowGround) {
      this.vehicle.y = expectedY;
      this.vehicle.vy = 0;
      this.vehicle.angle = slopeAngle;
    } else if (!aboveGround) {
      const springStrength = 0.2;
      const damping = 0.9;
      const displacement = expectedY - this.vehicle.y;
      this.vehicle.vy += displacement * springStrength;
      this.vehicle.vy *= damping;
      this.vehicle.angle = slopeAngle;
    }
  }

  drawTerrain(camX: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.canvas.height);
    for (let x = 0; x <= this.canvas.width; x += 10) {
      const worldX = camX + x;
      const y = this.getTerrainY(worldX);
      this.ctx.lineTo(x, y);
    }
    this.ctx.lineTo(this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#654321';
    this.ctx.fill();
  }

  drawVehicle(camX: number) {
    const { x, y, angle, width, height, wheelRadius, wheelBase } = this.vehicle;
    this.ctx.save();
    this.ctx.translate(x - camX, y);
    this.ctx.rotate(angle);
    this.ctx.fillStyle = 'red';
    this.ctx.fillRect(-width / 2, -height / 2, width, height);

    const drawWheel = (offsetX: number) => {
      this.ctx.beginPath();
      this.ctx.arc(offsetX, height / 2, wheelRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = 'black';
      this.ctx.fill();
    };

    drawWheel(-wheelBase / 2);
    drawWheel(wheelBase / 2);

    this.ctx.restore();
  }

  resetGame() {
    this.questions = this.questions.map(q => ({ ...q, done: false }));
    this.SPEED = 0.3;
    Object.assign(this.vehicle, {
      x: 0, y: 0, vx: this.SPEED, vy: 0,
      width: 50, height: 25, wheelBase: 25, wheelRadius: 10
    });
    this.bridgeShownFor = null;
    this.score = 0;
    this.consecutiveCorrect = 0;
    this.setScore(0);
    this.initVehicleY();
    this.paused = true;
    document.getElementById('quizContainer')!.style.display = 'none';
    document.getElementById('pauseBtn')!.style.display = 'none';
    const startBtn = document.getElementById('startBtn')!;
    startBtn.style.display = 'block';
    startBtn.innerText = 'Play Again';
    this.cliff = null;
    this.quizReady = false;
    this.gameOver = false;
    this.nextQuestionAt = null;
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    if (this.gameOver || this.paused) return;

    this.updateVehicle();
    const camX = this.vehicle.x - this.canvas.width * 0.1;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawTerrain(camX);
    this.drawVehicle(camX);

    if (this.nextQuestionAt && Date.now() >= this.nextQuestionAt) {
      this.spawnCliff();
      this.showQuestion();
      this.nextQuestionAt = null;
    }

    if (this.cliff && this.cliff.active && !this.cliff.bridgeShown) {
      const frontWheelX = this.vehicle.x + this.vehicle.wheelBase / 2;
      const pastCliff = frontWheelX > this.cliff.x + this.cliff.width;
      if (frontWheelX > this.cliff.x + this.cliff.width + 100) {
        this.quizReady = false;
        document.getElementById('quizContainer')!.style.display = 'none';
        document.getElementById('pauseBtn')!.style.display = 'none';
      }
      if (pastCliff || pastCliff && this.vehicle.y > this.getTerrainY(this.vehicle.x) + 100) {
        this.SPEED = 0;
        this.vehicle.vx = 0;
        this.vehicle.vy = 0;
        this.quizReady = false;
        document.getElementById('quizContainer')!.style.display = 'none';
        document.getElementById('pauseBtn')!.style.display = 'none';
        this.gameOver = true;
        this.cliff = null;
        this.soundFalling.play();
        setTimeout(() => {
          this.soundGameOver.play();
          this.resetGame();
        }, 5000);
      }
    }
  }

  setHighScore(score: number) {
    this.highScore = score;
    localStorage.setItem('highScore', score.toString());
    document.getElementById('highScore')!.textContent = `High Score: ${score}`;
  }

  setScore(score: number) {
    this.score = score > 0 ? score : 0;
    document.getElementById('score')!.textContent = `Score: ${this.score}`;
    if (score > this.highScore) {
      this.setHighScore(score);
    }
  }

  updateScore(points: number) {
    this.score += points;
    this.setScore(this.score);
  }
}
