# 소개

## wgpu란 무엇인가?

[Wgpu](https://github.com/gfx-rs/wgpu)는 [WebGPU API 사양](https://gpuweb.github.io/gpuweb/)의 Rust 구현체입니다. WebGPU는 GPU for the Web Community Group에서 발표한 사양으로, 웹 코드가 안전하고 신뢰할 수 있는 방식으로 GPU 기능에 접근할 수 있도록 하는 것을 목표로 합니다. 이를 위해 Vulkan API를 모방하고, 이를 호스트 하드웨어가 사용하는 API(예: DirectX, Metal, Vulkan)로 변환합니다.

Wgpu는 아직 개발 중이므로, 이 문서의 일부 내용은 변경될 수 있습니다.

## 왜 Rust인가?

Wgpu는 C 바인딩을 제공하여 C/C++ 코드를 작성할 수 있게 할 뿐만 아니라, C와 연동되는 다른 언어에서도 사용할 수 있습니다. 그렇긴 하지만, wgpu는 Rust로 작성되었고, 별다른 까다로운 과정 없이 사용할 수 있는 편리한 Rust 바인딩을 제공합니다. 게다가, 저는 Rust로 프로그래밍하는 것을 즐기고 있습니다.

제가 Rust 문법에 대해 자세히 다루지는 않을 것이므로, 이 튜토리얼을 사용하기 전에 Rust에 상당히 익숙해져야 합니다. Rust가 아직 익숙하지 않다면 [Rust 튜토리얼](https://www.rust-lang.org/learn)을 다시 살펴보시는 것을 추천합니다. 또한 [Cargo](https://doc.rust-lang.org/cargo/)에도 익숙해야 합니다.

저 또한 이 프로젝트를 통해 wgpu를 배우는 입장이므로, 중요한 세부 사항을 놓치거나 설명을 부족하게 할 수도 있습니다. 건설적인 피드백은 언제나 환영합니다.

## 기여 및 후원

*   오타, 잘못된 정보, 기타 내용 불일치와 같은 문제를 해결하기 위한 풀 리퀘스트([GitHub repo](https://github.com/sotrh/learn-wgpu))를 받고 있습니다.
*   wgpu의 API가 빠르게 변경되고 있기 때문에, 쇼케이스 데모를 위한 새로운 풀 리퀘스트는 받지 않고 있습니다.
*   저를 직접 후원하고 싶으시다면, 제 [Patreon](https://www.patreon.com/sotrh)을 확인해주세요!

## 번역

*   [中文版: 增加了与 App 的集成与调试系列章节](https://jinleili.github.io/learn-wgpu-zh/)

## 후원자분들께 드리는 특별한 감사

*   Bernard Llanos
*   Aron Granberg
*   Jani Turkia
*   David Laban
*   papyDoctor
*   Filip
*   Julius Liu
*   Ian Gowen
*   オリトイツキ
*   Lions Heart
*   Feng Liang
*   Mattia Samiolo
*   Lennart
*   Nico Arbogast
*   Ryan
*   Zeh Fernando
*   Jan Šipr
*   Dude
*   Joris Willems
*   Alexander Kabirov
*   Youngsuk Kim
*   Andrea Postal
*   charlesk
*   dadofboi
*   Felix
*   Gunstein Vatnar
*   Davide Prati
*   Tema
*   Paul E Hansen
*   大典 加藤
*   Thunk
*   Craft Links
*   Danny McGee
*   Ken K
*   Ben Anderson
*   yutani
*   Eliot Bolduc
