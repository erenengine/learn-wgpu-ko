# 퐁 (Pong)

![퐁 스크린샷](./pong.png)

<div class="warning">

이 예제는 `wgpu = "25.0"` 버전부터 작동하지 않습니다. 만약 크레이트가 최신 버전으로 업데이트된다면 저도 코드를 수정하겠지만, 크레이트 관리자가 사용자들에게 [glypon](https://github.com/grovesNL/glyphon?tab=readme-ov-file) 사용을 권장하고 있는 상황이라, 저도 glypon으로 전환하거나 직접 텍스트 코드를 작성하는 것을 고려하고 있습니다.

</div>

사실상 게임계의 "Hello World!"라고 할 수 있죠. 퐁은 수천 번도 더 리메이크되었습니다. 저도 알고, 여러분도 알고, 우리 모두가 아는 퐁입니다. 그렇긴 하지만, 이번에는 대부분의 사람들이 하는 것보다 조금 더 노력을 기울여보고 싶었습니다. 이 쇼케이스에는 기본적인 메뉴 시스템, 사운드, 그리고 다양한 게임 상태가 포함되어 있습니다.

아키텍처는 "일단 되게 만들자"는 생각으로 작업했기 때문에 최고라고 할 수는 없습니다. 만약 이 프로젝트를 다시 한다면 많은 것을 바꿀 것 같습니다. 어쨌든, 회고를 시작해 보겠습니다.

## 아키텍처

저는 상태(state)를 렌더링 코드에서 분리하는 실험을 해보고 있었습니다. 결과적으로 엔티티 컴포넌트 시스템(ECS) 모델과 비슷해졌습니다.

장면의 모든 객체를 포함하는 `State` 클래스를 만들었습니다. 여기에는 공과 패들뿐만 아니라 점수 텍스트와 메뉴까지 포함됩니다. `State`는 또한 `GameState` 타입의 `game_state` 필드를 가집니다.

```rust
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum GameState {
    MainMenu, // 메인 메뉴
    Serving,  // 서브 중
    Playing,  // 플레이 중
    GameOver, // 게임 오버
    Quiting,  // 종료 중
}
```

데이터 지향적인 접근 방식을 취했기 때문에 `State` 클래스 자체에는 메서드가 없었습니다. 대신, `System` 트레이트(trait)를 만들고 이를 구현하는 여러 구조체를 만들었습니다.

```rust
pub trait System {
    #[allow(unused_variables)]
    fn start(&mut self, state: &mut state::State) {}
    fn update_state(
        &self,
        input: &input::Input,
        state: &mut state::State,
        events: &mut Vec<state::Event>,
    );
}
```

시스템들은 다양한 객체의 상태(위치, 가시성 등)를 업데이트하고 `game_state` 필드를 업데이트하는 역할을 담당합니다. 시작 시 모든 시스템을 생성하고, `game_state`에 대한 `match` 문을 사용하여 어떤 시스템을 실행할지 결정했습니다(`visiblity_system`은 항상 필요하므로 계속 실행됩니다).

```rust
visiblity_system.update_state(&input, &mut state, &mut events);
match state.game_state {
    state::GameState::MainMenu => {
        menu_system.update_state(&input, &mut state, &mut events);
        if state.game_state == state::GameState::Serving {
            serving_system.start(&mut state);
        }
    },
    state::GameState::Serving => {
        serving_system.update_state(&input, &mut state, &mut events);
        play_system.update_state(&input, &mut state, &mut events);
        if state.game_state == state::GameState::Playing {
            play_system.start(&mut state);
        }
    },
    state::GameState::Playing => {
        ball_system.update_state(&input, &mut state, &mut events);
        play_system.update_state(&input, &mut state, &mut events);
        if state.game_state == state::GameState::Serving {
            serving_system.start(&mut state);
        } else if state.game_state == state::GameState::GameOver {
            game_over_system.start(&mut state);
        }
    },
    state::GameState::GameOver => {
        game_over_system.update_state(&input, &mut state, &mut events);
        if state.game_state == state::GameState::MainMenu {
            menu_system.start(&mut state);
        }
    },
    state::GameState::Quiting => {},
}
```

분명 가장 깔끔한 코드는 아니지만, 작동은 합니다.

결과적으로 총 6개의 시스템을 만들었습니다.

1.  `VisibilitySystem`은 개발 막바지에 추가했습니다. 그전까지는 모든 시스템이 객체의 `visible` 필드를 직접 설정해야 했습니다. 이건 고통스럽고 로직을 어지럽혔습니다. 대신, 이를 처리할 `VisiblitySystem`을 만들기로 결정했습니다.

2.  `MenuSystem`은 어떤 텍스트에 포커스가 맞춰졌는지, 그리고 사용자가 엔터 키를 눌렀을 때 어떤 일이 일어날지를 처리했습니다. `Play` 버튼에 포커스가 맞춰진 상태에서 엔터를 누르면 `game_state`가 `GameState::Serving`으로 바뀌어 게임이 시작됩니다. `Quit` 버튼은 `GameState::Quiting`으로 전환합니다.

3.  `ServingSystem`은 공의 위치를 `(0.0, 0.0)`으로 설정하고, 점수 텍스트를 업데이트하며, 타이머가 지난 후 `GameState::Playing`으로 전환합니다.

4.  `PlaySystem`은 플레이어를 제어합니다. 플레이어가 움직이게 하고 플레이 공간을 벗어나지 않도록 막습니다. 이 시스템은 `GameState::Playing`과 `GameState::Serving` 두 상태 모두에서 실행됩니다. 이는 플레이어가 서브 전에 위치를 재조정할 수 있도록 하기 위함입니다. 또한 `PlaySystem`은 한 플레이어의 점수가 2점을 초과하면 `GameState::GameOver`로 전환합니다.

5.  `BallSystem`은 공의 움직임과 벽/플레이어와의 충돌 반사를 제어합니다. 또한 점수를 업데이트하고, 공이 화면 옆으로 나가면 `GameState::Serving`으로 전환합니다.

6.  `GameOver` 시스템은 `win_text`를 업데이트하고 잠시 후 `GameState::MainMenu`로 전환합니다.

이 시스템 접근 방식은 작업하기에 꽤 좋았습니다. 제 구현이 최선은 아니었지만, 다시 한번 이 방식으로 작업해보고 싶습니다. 어쩌면 저만의 ECS를 구현할 수도 있겠네요.

## 입력

`System` 트레이트에는 원래 `process_input` 메서드가 있었습니다. 이 방식은 서브 사이에 플레이어가 움직일 수 있게 구현할 때 문제가 되었습니다. `game_state`가 `Serving`에서 `Playing`으로 전환될 때 입력이 갇히는 문제가 발생했습니다. 저는 현재 사용 중인 시스템에서만 `process_input`을 호출했기 때문입니다. 이걸 바꾸는 건 꽤 번거로운 일이 될 것 같아, 모든 입력 코드를 별도의 구조체로 옮기기로 결정했습니다.

```rust
use winit::event::{VirtualKeyCode, ElementState};

#[derive(Debug, Default)]
pub struct Input {
    pub p1_up_pressed: bool,
    pub p1_down_pressed: bool,
    pub p2_up_pressed: bool,
    pub p2_down_pressed: bool,
    pub enter_pressed: bool,
}

impl Input {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn update(&mut self, key: VirtualKeyCode, state: ElementState) -> bool {
        let pressed = state == ElementState::Pressed;
        match key {
            VirtualKeyCode::Up => {
                self.p2_up_pressed = pressed;
                true
            }
            VirtualKeyCode::Down => {
                self.p2_down_pressed = pressed;
                true
            }
            VirtualKeyCode::W => {
                self.p1_up_pressed = pressed;
                true
            }
            VirtualKeyCode::S => {
                self.p1_down_pressed = pressed;
                true
            }
            VirtualKeyCode::Return => {
                self.enter_pressed = pressed;
                true
            }
            _ => false
        }
    }

    pub fn ui_up_pressed(&self) -> bool {
        self.p1_up_pressed || self.p2_up_pressed
    }

    pub fn ui_down_pressed(&self) -> bool {
        self.p1_down_pressed || self.p2_down_pressed
    }
}
```

이 방법은 아주 잘 작동합니다. 이 구조체를 `update_state` 메서드에 그냥 전달하기만 하면 됩니다.

## 렌더링

텍스트에는 [wgpu_glyph](https://docs.rs/wgpu_glyph)를 사용했고, 공과 패들은 흰색 사각형으로 그렸습니다. 이 부분은 크게 할 말이 없습니다. 어쨌든 퐁이니까요.

하지만 배치(batching)를 좀 다뤄봤습니다. 이 프로젝트에는 완전히 과한 기능이었지만, 좋은 학습 경험이었습니다. 관심 있으시면 아래 코드를 보세요.

```rust
pub struct QuadBufferBuilder {
    vertex_data: Vec<Vertex>,
    index_data: Vec<u32>,
    current_quad: u32,
}

impl QuadBufferBuilder {
    pub fn new() -> Self {
        Self {
            vertex_data: Vec::new(),
            index_data: Vec::new(),
            current_quad: 0,
        }
    }

    // 공을 버퍼에 추가합니다.
    pub fn push_ball(self, ball: &state::Ball) -> Self {
        if ball.visible {
            let min_x = ball.position.x - ball.radius;
            let min_y = ball.position.y - ball.radius;
            let max_x = ball.position.x + ball.radius;
            let max_y = ball.position.y + ball.radius;

            self.push_quad(min_x, min_y, max_x, max_y)
        } else {
            self
        }
    }

    // 플레이어를 버퍼에 추가합니다.
    pub fn push_player(self, player: &state::Player) -> Self {
        if player.visible {
            self.push_quad(
                player.position.x - player.size.x * 0.5,
                player.position.y - player.size.y * 0.5,
                player.position.x + player.size.x * 0.5,
                player.position.y + player.size.y * 0.5,
            )
        } else {
            self
        }
    }

    // 사각형을 버퍼에 추가합니다.
    pub fn push_quad(mut self, min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> Self {
        self.vertex_data.extend(&[
            Vertex {
                position: (min_x, min_y).into(),
            },
            Vertex {
                position: (max_x, min_y).into(),
            },
            Vertex {
                position: (max_x, max_y).into(),
            },
            Vertex {
                position: (min_x, max_y).into(),
            },
        ]);
        self.index_data.extend(&[
            self.current_quad * 4 + 0,
            self.current_quad * 4 + 1,
            self.current_quad * 4 + 2,
            self.current_quad * 4 + 0,
            self.current_quad * 4 + 2,
            self.current_quad * 4 + 3,
        ]);
        self.current_quad += 1;
        self
    }

    // 버퍼를 빌드합니다.
    pub fn build(self, device: &wgpu::Device) -> (StagingBuffer, StagingBuffer, u32) {
        (
            StagingBuffer::new(device, &self.vertex_data),
            StagingBuffer::new(device, &self.index_data),
            self.index_data.len() as u32,
        )
    }
}
```

## 사운드

사운드에는 [rodio](https://docs.rs/rodio)를 사용했습니다. 사운드를 저장하기 위해 `SoundPack` 클래스를 만들었습니다. 소리를 어떻게 재생할지 결정하는 데 약간의 고민이 필요했습니다. `update_state` 메서드에 `Vec<state::Event>`를 전달하는 방법을 선택했습니다. 그러면 시스템이 `Vec`에 이벤트를 푸시(push)하도록 했습니다. `Event` 열거형은 아래와 같습니다.

```rust
#[derive(Debug, Copy, Clone)]
pub enum Event {
    ButtonPressed, // 버튼 눌림
    FocusChanged, // 포커스 변경
    BallBounce(cgmath::Vector2<f32>), // 공 튕김
    Score(u32), // 득점
}
```

원래는 `BallBounce` 이벤트에서 `SpatialSink`를 사용해 위치 기반 사운드를 재생하려고 했지만, 클리핑 문제가 발생했고 프로젝트를 마무리하고 싶었기 때문에 그만두었습니다. 그 점을 제외하면 이벤트 시스템은 훌륭하게 작동했습니다.

## WASM 지원

이 예제는 웹에서도 작동하지만, 몇 가지 추가 단계가 필요했습니다. 첫 번째는 `main.rs` 대신 `lib.rs`를 사용하도록 전환하는 것이었습니다. 웹 어셈블리를 만들기 위해 [wasm-pack](https://rustwasm.github.io/wasm-pack/)을 사용하기로 했습니다. wasm-bindgen을 직접 사용하면 기존 형식을 유지할 수도 있었지만, 잘못된 버전의 wasm-bindgen을 사용하는 문제에 부딪혀서 wasm-pack을 고수하기로 했습니다.

wasm-pack이 제대로 작동하려면 먼저 몇 가지 의존성을 추가해야 했습니다:

```toml[dependencies]
anyhow = "1.0"
env_logger = "0.10"
winit = { version = "0.30", features = ["android-native-activity"] }
anyhow = "1.0"
bytemuck = { version = "1.16", features = [ "derive" ] }
cgmath = "0.18"
pollster = "0.3"
wgpu = { version = "25.0", features = ["spirv"]}
wgpu_glyph = "0.19"
rand = "0.8"
rodio = { version = "0.15", default-features = false, features = ["wav"] }
log = "0.4"
instant = "0.1"

[target.'cfg(target_arch = "wasm32")'.dependencies]
console_error_panic_hook = "0.1.6"
console_log = "1.0"
getrandom = { version = "0.2", features = ["js"] }
rodio = { version = "0.15", default-features = false, features = ["wasm-bindgen", "wav"] }
wasm-bindgen-futures = "0.4.20"
wasm-bindgen = "0.2"
web-sys = { version = "0.3", features = [
    "Document",
    "Window",
    "Element",
]}
wgpu = { version = "25.0", features = ["spirv", "webgl"]}

[build-dependencies]
anyhow = "1.0"
fs_extra = "1.2"
glob = "0.3"
rayon = "1.4"
naga = { version = "0.9", features = ["glsl-in", "spv-out", "wgsl-out"]}

```

이 중 몇 가지를 강조하겠습니다:

-   `rand`: 웹에서 `rand`를 사용하려면, `getrandom`을 직접 포함하고 `js` 기능을 활성화해야 합니다.
-   `rodio`: WASM 빌드를 위해 모든 기본 기능을 비활성화한 후, 필요한 기능만 별도로 활성화해야 했습니다. 특히 `mp3` 기능이 저에게는 작동하지 않았습니다. 해결 방법이 있을 수도 있지만, 이 예제에서는 mp3를 사용하지 않으므로 wav만 사용하기로 했습니다.
-   `instant`: 이 크레이트는 기본적으로 `std::time::Instant`를 감싸는 래퍼입니다. 일반 빌드에서는 타입 별칭에 불과하지만, 웹 빌드에서는 브라우저의 시간 함수를 사용합니다.
-   `cfg-if`: 플랫폼별 코드를 덜 끔찍하게 작성할 수 있게 해주는 편리한 크레이트입니다.
-   `env_logger`와 `console_log`: `env_logger`는 웹 어셈블리에서 작동하지 않으므로 다른 로거를 사용해야 합니다. `console_log`는 웹 어셈블리 튜토리얼에서 사용되는 것이라 저도 그것을 선택했습니다.
-   `wasm-bindgen`: Rust 코드를 웹에서 작동하게 만드는 접착제 역할을 하는 크레이트입니다. `wasm-bindgen` 명령어를 사용하여 빌드하는 경우, 명령어 버전의 `wasm-bindgen`이 `Cargo.toml`의 버전과 **정확히** 일치하는지 확인해야 합니다. 그렇지 않으면 문제가 발생합니다. `wasm-pack`을 사용하면 크레이트에 맞는 `wasm-bindgen` 바이너리를 다운로드하여 사용해 줍니다.
-   `web-sys`: `getElementById()`와 같이 자바스크립트에서 사용 가능한 다양한 메서드를 사용할 수 있게 해주는 함수와 타입을 포함합니다.

이제 이 부분은 넘어가고 코드에 대해 이야기해 봅시다. 먼저, 이벤트 루프를 시작할 함수를 만들어야 합니다.

```rust
#[cfg(target_arch="wasm32")]
use wasm_bindgen::prelude::*;

#[cfg_attr(target_arch="wasm32", wasm_bindgen(start))]
pub fn start() {
    // ... 생략 ...
}
```

`wasm_bindgen(start)`는 이 함수가 웹 어셈블리 모듈이 자바스크립트에 의해 로드되자마자 시작되어야 한다는 것을 `wasm-bindgen`에 알려줍니다. 이 함수 내부의 대부분의 코드는 이 사이트의 다른 예제에서 볼 수 있는 것과 동일하지만, 웹에서는 특별히 해야 할 몇 가지 작업이 있습니다.

```rust
cfg_if::cfg_if! {
    if #[cfg(target_arch = "wasm32")] {
        console_log::init_with_level(log::Level::Warn).expect("Could't initialize logger");
        std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    } else {
        env_logger::init();
    }
}
```

이 코드는 중요한 작업을 하기 전에 실행되어야 합니다. 빌드하는 아키텍처에 따라 로거를 설정합니다. 대부분의 아키텍처는 `env_logger`를 사용합니다. `wasm32` 아키텍처는 `console_log`를 사용합니다. 또한 Rust가 패닉(panic)을 자바스크립트로 전달하도록 설정하는 것이 중요합니다. 이렇게 하지 않으면 Rust 코드가 언제 패닉을 일으키는지 알 수 없습니다.

다음으로, 창을 만듭니다. 대부분은 이전에 해왔던 것과 같지만, 전체 화면을 지원하기 때문에 몇 가지 추가 단계를 거쳐야 합니다.

```rust
let event_loop = EventLoop::new();
let monitor = event_loop.primary_monitor().unwrap();
let video_mode = monitor.video_modes().next();
let size = video_mode.clone().map_or(PhysicalSize::new(800, 600), |vm| vm.size());
let window = WindowBuilder::new()
    .with_visible(false)
    .with_title("Pong")
    .with_fullscreen(video_mode.map(|vm| Fullscreen::Exclusive(vm)))
    .build(&event_loop)
    .unwrap();

// WASM 빌드는 모니터 정보에 접근할 수 없으므로,
// 대체 해상도를 지정해야 합니다.
if window.fullscreen().is_none() {
    window.set_inner_size(PhysicalSize::new(512, 512));
}
```

그런 다음 해당 플랫폼이라면 웹 전용 작업을 해야 합니다.

```rust
#[cfg(target_arch = "wasm32")]
{
    use winit::platform::web::WindowExtWebSys;
    web_sys::window()
        .and_then(|win| win.document())
        .and_then(|doc| {
            let dst = doc.get_element_by_id("wasm-example")?;
            let canvas = web_sys::Element::from(window.canvas()?);
            dst.append_child(&canvas).ok()?;

            // 전체 화면을 요청하고, 거부되면 정상적으로 계속합니다.
            match canvas.request_fullscreen() {
                Ok(_) => {},
                Err(_) => ()
            }

            Some(())
        })
        .expect("Couldn't append canvas to document body.");
}
```

다른 모든 것은 동일하게 작동합니다.

## 요약

재미있는 프로젝트였습니다. 과하게 설계되었고 변경하기가 다소 어려웠지만, 그럼에도 불구하고 좋은 경험이었습니다.

<!-- 아래에서 코드를 실행해보세요! (현재는 키보드 조작이 필요합니다.)

<WasmExample example="pong"></WasmExample> -->
