# 절차적 지형 생성

지금까지 우리는 텅 빈 공간에서 작업해 왔습니다. 셰이딩 코드를 완벽하게 만들고 싶을 때는 이 방법이 좋지만, 대부분의 애플리케이션은 화면을 더 흥미로운 것들로 채우고 싶을 것입니다. 이 작업에는 여러 가지 방법으로 접근할 수 있습니다. 블렌더(Blender)에서 여러 모델을 만들어 씬(scene)으로 불러올 수 있습니다. 이 방법은 상당한 예술적 감각과 인내심이 있다면 훌륭하게 작동합니다. 저는 두 가지 모두 부족하기 때문에, 멋져 보이는 것을 만드는 코드를 작성해 봅시다.

이 글의 제목에서 알 수 있듯이, 우리는 지형을 만들 것입니다. 이제, 지형 메시를 만드는 전통적인 방법은 미리 생성된 노이즈 텍스처를 사용하고 이를 샘플링하여 메시의 각 지점의 높이 값을 얻는 것입니다. 이것도 유효한 접근 방식이지만, 저는 컴퓨트 셰이더를 사용해 직접 노이즈를 생성하는 방법을 선택했습니다. 시작해 봅시다!

## 컴퓨트 셰이더 (Compute Shaders)

컴퓨트 셰이더는 GPU의 병렬 컴퓨팅 능력을 임의의 작업에 활용할 수 있게 해주는 간단한 셰이더입니다. 텍스처 생성부터 신경망 실행에 이르기까지 모든 것에 사용할 수 있습니다. 작동 방식에 대해서는 잠시 후에 더 자세히 다루겠지만, 지금은 지형의 정점(vertex) 버퍼와 인덱스(index) 버퍼를 만드는 데 사용한다는 것만 알아두시면 충분합니다.

<div class="note">

이 글을 쓰는 시점에서, 웹에서의 컴퓨트 셰이더는 아직 실험적인 기능입니다. 크롬 카나리(Chrome Canary)나 파이어폭스 나이틀리(Firefox Nightly)와 같은 브라우저의 베타 버전에서 이 기능을 활성화할 수 있습니다. 이 때문에, 컴퓨트 셰이더 방법을 다룬 후에 프래그먼트 셰이더를 사용하여 정점 및 인덱스 버퍼를 계산하는 방법도 다룰 것입니다.

</div>

## 노이즈 함수 (Noise Functions)

컴퓨트 셰이더의 셰이더 코드부터 시작하겠습니다. 먼저, 노이즈 함수를 만들 것입니다. 그런 다음, 컴퓨트 셰이더의 진입 함수를 만들 것입니다. `terrain.wgsl`이라는 새 파일을 만들고 다음 코드를 추가하세요:

```wgsl
// ============================
// 지형 생성
// ============================

// https://gist.github.com/munrocket/236ed5ba7e409b8bdf1ff6eca5dcdc39
//  MIT 라이선스. © Ian McEwan, Stefan Gustavson, Munrocket
// - 주석이 포함된 덜 압축적인 GLSL 구현은 https://weber.itn.liu.se/~stegu/jgt2012/article.pdf 에서 찾을 수 있습니다.

fn permute3(x: vec3<f32>) -> vec3<f32> { return (((x * 34.) + 1.) * x) % vec3<f32>(289.); }

fn snoise2(v: vec2<f32>) -> f32 {
  let C = vec4<f32>(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  var i: vec2<f32> = floor(v + dot(v, C.yy));
  let x0 = v - i + dot(i, C.xx);
  // 제가 관찰하던 일부 아티팩트를 수정하기 위해 여기서 조건을 > 에서 < 로 뒤집었습니다.
  var i1: vec2<f32> = select(vec2<f32>(1., 0.), vec2<f32>(0., 1.), (x0.x < x0.y));
  var x12: vec4<f32> = x0.xyxy + C.xxzz - vec4<f32>(i1, 0., 0.);
  i = i % vec2<f32>(289.);
  let p = permute3(permute3(i.y + vec3<f32>(0., i1.y, 1.)) + i.x + vec3<f32>(0., i1.x, 1.));
  var m: vec3<f32> = max(0.5 -
      vec3<f32>(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3<f32>(0.));
  m = m * m;
  m = m * m;
  let x = 2. * fract(p * C.www) - 1.;
  let h = abs(x) - 0.5;
  let ox = floor(x + 0.5);
  let a0 = x - ox;
  m = m * (1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h));
  let g = vec3<f32>(a0.x * x0.x + h.x * x0.y, a0.yz * x12.xz + h.yz * x12.yw);
  return 130. * dot(m, g);
}
```

독자 중 일부는 이것이 심플렉스 노이즈(Simplex noise), 특히 오픈심플렉스 노이즈(OpenSimplex noise)의 구현이라는 것을 알아차리셨을 겁니다. 솔직히 오픈심플렉스 노이즈의 수학적 원리를 완전히 이해하지는 못합니다. 기본 원리는 페를린 노이즈(Perlin Noise)와 비슷하지만, 사각형 그리드 대신 육각형 그리드를 사용하여 사각형 그리드에서 노이즈를 생성할 때 발생하는 일부 아티팩트(artifact)를 제거한다는 것입니다. 다시 말하지만, 저는 이 분야의 전문가는 아니므로 요약하자면: `permute3()`는 `vec3`를 받아 의사 난수 `vec3`를 반환하고, `snoise2()`는 `vec2`를 받아 [-1, 1] 사이의 부동 소수점 숫자를 반환합니다. 노이즈 함수에 대해 더 배우고 싶다면 [셰이더의 책(The Book of Shaders)의 이 글](https://thebookofshaders.com/11/)을 확인해 보세요. 코드는 GLSL로 되어 있지만 개념은 동일합니다.

`snoise`의 출력을 직접 사용하여 지형의 높이 값을 생성할 수도 있지만, 그 결과는 매우 매끄러운 경향이 있습니다. 이것이 원하는 결과일 수도 있지만, 아래에서 볼 수 있듯이 그다지 유기적으로 보이지는 않습니다.

![매끄러운 지형](./figure_no-fbm.png)

지형을 좀 더 거칠게 만들기 위해, 우리는 [프랙탈 브라운 운동(Fractal Brownian Motion)](https://thebookofshaders.com/13/)이라는 기법을 사용할 것입니다. 이 기법은 노이즈 함수를 여러 번 샘플링하면서, 매번 노이즈의 주파수를 두 배로 늘리는 동시에 강도를 절반으로 줄이는 방식으로 작동합니다. 이는 지형의 전반적인 모양은 상당히 매끄럽지만, 더 날카로운 디테일을 갖게 됨을 의미합니다. 아래에서 그 결과가 어떻게 보일지 확인할 수 있습니다.

![더 유기적인 지형](./figure_fbm.png)

이 함수의 코드는 사실 매우 간단합니다:

```wgsl
fn fbm(p: vec2<f32>) -> f32 {
    let NUM_OCTAVES: u32 = 5u;
    var x = p * 0.01;
    var v = 0.0;
    var a = 0.5;
    let shift = vec2<f32>(100.0);
    let cs = vec2<f32>(cos(0.5), sin(0.5));
    let rot = mat2x2<f32>(cs.x, cs.y, -cs.y, cs.x);

    for (var i=0u; i<NUM_OCTAVES; i=i+1u) {
        v = v + a * snoise2(x);
        x = rot * x * 2.0 + shift;
        a = a * 0.5;
    }

    return v;
}
```

이 코드를 잠시 살펴보겠습니다:

-   `NUM_OCTAVES` 상수는 원하는 노이즈 레벨의 수입니다. 옥타브가 많을수록 지형 메시에 더 많은 질감을 추가하지만, 높은 레벨에서는 효과가 줄어듭니다. 저는 5가 좋은 숫자라고 생각합니다.
-   노이즈 함수를 '확대(zoom in)'하기 위해 `p`에 `0.01`을 곱합니다. 이는 우리 메시가 1x1 쿼드로 이루어져 있고, 심플렉스 노이즈 함수는 매번 1씩 증가할 때 백색 소음(white noise)과 유사해지기 때문입니다. `p`를 직접 사용하면 어떻게 보이는지 아래에서 확인할 수 있습니다: ![뾰족한 지형](./figure_spiky.png)
-   `a` 변수는 주어진 노이즈 레벨에서의 노이즈 진폭(amplitude)입니다.
-   `shift`와 `rot`는 생성된 노이즈의 아티팩트를 줄이는 데 사용됩니다. 그러한 아티팩트 중 하나는 `0,0`에서 `p`를 얼마나 스케일링하든 `snoise`의 출력이 항상 같아지는 것입니다.

## 메시 생성하기

지형 메시를 생성하려면 셰이더에 몇 가지 정보를 전달해야 합니다:

```wgsl
struct ChunkData {
    chunk_size: vec2<u32>,
    chunk_corner: vec2<i32>,
    min_max_height: vec2<f32>,
}

struct Vertex {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
}

struct VertexBuffer {
    data: array<Vertex>, // stride: 32
}

struct IndexBuffer {
    data: array<u32>,
}

@group(0) @binding(0) var<uniform> chunk_data: ChunkData;
@group(0)@binding(1) var<storage, read_write> vertices: VertexBuffer;
@group(0)@binding(2) var<storage, read_write> indices: IndexBuffer;
```

우리 셰이더는 `chunk_size`에 쿼드 그리드의 크기, `chunk_corner`에 노이즈 알고리즘이 시작해야 할 위치, 그리고 `min_max_height`에 지형의 최소 및 최대 높이를 포함하는 `uniform` 버퍼를 기대합니다.

정점 및 인덱스 버퍼는 `read_write`가 활성화된 `storage` 버퍼로 전달됩니다. 우리는 Rust에서 실제 버퍼를 만들고 컴퓨트 셰이더를 실행할 때 바인딩할 것입니다.

셰이더의 다음 부분은 메시 위의 한 점과 그 점에서의 정점을 생성하는 함수들입니다:

```wgsl
fn terrain_point(p: vec2<f32>) -> vec3<f32> {
    return vec3<f32>(
        p.x,
        mix(chunk_data.min_max_height.x,chunk_data.min_max_height.y, fbm(p)),
        p.y,
    );
}

fn terrain_vertex(p: vec2<f32>) -> Vertex {
    let v = terrain_point(p);

    let tpx = terrain_point(p + vec2<f32>(0.1, 0.0)) - v;
    let tpz = terrain_point(p + vec2<f32>(0.0, 0.1)) - v;
    let tnx = terrain_point(p + vec2<f32>(-0.1, 0.0)) - v;
    let tnz = terrain_point(p + vec2<f32>(0.0, -0.1)) - v;

    let pn = normalize(cross(tpz, tpx));
    let nn = normalize(cross(tnz, tnx));

    let n = (pn + nn) * 0.5;

    return Vertex(v, n);
}
```

`terrain_point` 함수는 지형의 XZ 좌표를 받아 최소 및 최대 높이 값 사이의 `y` 값을 가진 `vec3`를 반환합니다.

`terrain_vertex`는 `terrain_point`를 사용하여 위치를 얻고, 또한 네 개의 주변 점을 샘플링하여 [외적(cross products)](https://www.khanacademy.org/math/multivariable-calculus/thinking-about-multivariable-function/x786f2022:vectors-and-matrices/a/cross-products-mvc)을 사용하여 표면의 법선(normal)을 계산합니다.

<div class="note">

`Vertex` 구조체에 텍스처 좌표가 포함되어 있지 않다는 것을 눈치채셨을 겁니다. 정점의 XZ 좌표를 사용하고 텍스처 샘플러가 x와 y 축에서 텍스처를 미러링하도록 하여 텍스처 좌표를 쉽게 만들 수 있지만, 높이맵은 이런 방식으로 텍스처링할 때 늘어나는 경향이 있습니다.

향후 튜토리얼에서 트라이플래너 매핑(triplanar mapping)이라는 기법을 사용하여 지형을 텍스처링하는 방법을 다룰 것입니다. 지금은 지형을 렌더링하는 데 사용할 프래그먼트 셰이더에서 생성될 절차적 텍스처를 사용할 것입니다.

</div>

이제 지형 표면의 정점을 얻을 수 있으므로, 실제 데이터로 정점 및 인덱스 버퍼를 채울 수 있습니다. 컴퓨트 셰이더의 진입점이 될 `gen_terrain()` 함수를 만들 것입니다:

```wgsl
@compute @workgroup_size(64)
fn gen_terrain(
    @builtin(global_invocation_id) gid: vec3<u32>
) {
    // ... 생략 ...
}
```

`gen_terrain`이 컴퓨트 셰이더 진입점임을 `stage(compute)`로 어노테이션하여 지정합니다.

`workgroup_size()`는 GPU가 `워크그룹(workgroup)`당 할당할 수 있는 워커(worker)의 수입니다. 컴퓨트 셰이더를 실행할 때 워커의 수를 지정합니다. 기술적으로는 워크그룹이 3차원 그리드이므로 세 개의 매개변수가 있지만, 지정하지 않으면 기본값은 1입니다. 즉, `workgroup_size(64)`는 `workgroup_size(64, 1, 1)`과 같습니다.

`global_invocation_id`는 3차원 인덱스입니다. 이것이 이상하게 보일 수 있지만, 워크그룹을 3차원 그리드로 생각할 수 있습니다. 이 워크그룹들은 내부적으로 워커들의 그리드를 가집니다. `global_invocation_id`는 모든 다른 워커에 대한 현재 워커의 ID입니다.

시각적으로 워크그룹 그리드는 다음과 같이 보일 것입니다:

![워크그룹 그리드](./figure_work-groups.jpg)

<div class="note">

컴퓨트 셰이더를 여러 중첩된 for 루프에서 실행되는 함수로 생각하면 도움이 될 수 있습니다. 단, 각 루프는 병렬로 실행됩니다. 다음과 같이 보일 것입니다:

```
for wgx in num_workgroups.x:
    for wgy in num_workgroups.y:
        for wgz in num_workgroups.z:
            var local_invocation_id = (wgx, wgy, wgz)
            for x in workgroup_size.x:
                for y in workgroup_size.x:
                    for z in workgroup_size.x:
                        var global_invocation_id = local_invocation_id * workgroup_size + (x, y, z);
                        gen_terrain(global_invocation_id)
```

워크그룹에 대해 더 배우고 싶다면 [문서](https://www.w3.org/TR/WGSL/#compute-shader-workgroups)를 확인해 보세요.

</div>

TODO:
- `create_render_pipeline`의 변경 사항 기록하기
- `cgmath`의 `swizzle` 기능 언급하기
- 워크그룹과 워크그룹 크기를 중첩 for 루프와 비교하기
    - 블렌더로 다이어그램을 만들어볼까?
- 카메라 이동 속도 변경하기
