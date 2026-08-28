import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:permission_handler/permission_handler.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const NuttyApp());
}

class NuttyApp extends StatelessWidget {
  const NuttyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Nutty AI Assistant',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF070A14),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00F3FF),
          secondary: Color(0xFFA855F7),
        ),
      ),
      home: const NuttyHomeScreen(),
    );
  }
}

class NuttyHomeScreen extends StatefulWidget {
  const NuttyHomeScreen({super.key});

  @override
  State<NuttyHomeScreen> createState() => _NuttyHomeScreenState();
}

class _NuttyHomeScreenState extends State<NuttyHomeScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _requestPermissions();

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF070A14))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (String url) {
            setState(() {
              _isLoading = false;
            });
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint('Web Resource Error: ${error.description}');
          },
        ),
      )
      ..loadRequest(Uri.parse('http://10.0.2.2:3000')); // Connects to Nutty Node Server
  }

  Future<void> _requestPermissions() async {
    await [
      Permission.microphone,
      Permission.camera,
      Permission.speech,
    ].request();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            WebViewWidget(controller: _controller),
            if (_isLoading)
              const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CircularProgressIndicator(color: Color(0xFF00F3FF)),
                    SizedBox(height: 16),
                    Text(
                      'N.U.T.T.Y. KERNEL INITIALIZING...',
                      style: TextStyle(
                        color: Color(0xFF00F3FF),
                        fontFamily: 'monospace',
                        letterSpacing: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
