// Prüft den Release-Signaturschlüssel so, wie Gradle ihn liest: Keystore mit Passwort öffnen,
// Alias suchen, privaten Schlüssel mit dem Schlüssel-Passwort entschlüsseln.
// Aufruf (JDK 11+): java scripts/CheckKeystore.java <keystore-datei>
// Passwörter und Alias kommen aus KEYSTORE_PASSWORD, KEY_ALIAS und KEY_PASSWORD.
import java.io.File;
import java.security.KeyStore;
import java.security.UnrecoverableKeyException;
import java.util.Collections;
import java.util.List;

public class CheckKeystore {
  static void fail(String message) {
    System.out.println("::error::" + message);
    System.exit(1);
  }

  public static void main(String[] args) throws Exception {
    File file = new File(args[0]);
    char[] storePassword = System.getenv("KEYSTORE_PASSWORD").toCharArray();
    String alias = System.getenv("KEY_ALIAS");
    char[] keyPassword = System.getenv("KEY_PASSWORD").toCharArray();

    KeyStore store;
    try {
      store = KeyStore.getInstance(file, storePassword);
    } catch (Exception e) {
      // Falsches Passwort meldet Java als IOException mit UnrecoverableKeyException als Ursache.
      if (e.getCause() instanceof UnrecoverableKeyException) {
        fail("ANDROID_KEYSTORE_PASSWORD passt nicht zum Keystore aus ANDROID_KEYSTORE_BASE64.");
      }
      fail("ANDROID_KEYSTORE_BASE64 ist kein lesbarer Keystore (JKS oder PKCS12): " + e.getMessage());
      return;
    }
    System.out.println("Keystore geöffnet (Typ " + store.getType() + ").");

    List<String> aliases = Collections.list(store.aliases());
    if (!store.containsAlias(alias)) {
      fail("Im Keystore gibt es keinen Schlüssel mit dem Alias aus ANDROID_KEY_ALIAS (" + alias.length()
          + " Zeichen). Vorhandene Aliase: " + String.join(", ", aliases));
    }
    if (!store.isKeyEntry(alias)) {
      fail("Der Alias aus ANDROID_KEY_ALIAS ist ein Zertifikat ohne privaten Schlüssel. Vorhandene Aliase: "
          + String.join(", ", aliases));
    }
    try {
      if (store.getKey(alias, keyPassword) == null) fail("Der Schlüssel zum Alias lässt sich nicht lesen.");
    } catch (UnrecoverableKeyException e) {
      String hint = store.getType().equalsIgnoreCase("PKCS12")
          ? " Bei PKCS12-Keystores ist es dasselbe wie ANDROID_KEYSTORE_PASSWORD."
          : "";
      fail("ANDROID_KEY_PASSWORD passt nicht zum Schlüssel." + hint);
    }
    System.out.println("Alias gefunden, Schlüssel-Passwort passt.");
  }
}
